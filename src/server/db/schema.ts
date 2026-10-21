/**
 * Database schema (SPEC §4). Column names are written in camelCase here and
 * mapped to snake_case by Drizzle (`casing: "snake_case"`).
 *
 * Foreign keys use `on delete restrict`: nothing is hard-deleted outside the
 * admin purge, which deletes children explicitly (rule 6).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Column helpers

const id = () => uuid().primaryKey().defaultRandom();
const timestamptz = () => timestamp({ withTimezone: true });
const createdAt = () => timestamptz().notNull().defaultNow();
const updatedAt = () =>
  timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
/** Optimistic concurrency (ARQ-04). */
const version = () => integer().notNull().default(1);
const userRef = () => uuid().references(() => users.id, { onDelete: "restrict" });
const projectRef = () =>
  uuid()
    .notNull()
    .references(() => projects.id, { onDelete: "restrict" });

// ---------------------------------------------------------------------------
// Enums

export const dateFormat = pgEnum("date_format", ["YYYY/MM/DD", "MM/DD/YYYY"]);
export const memberRole = pgEnum("member_role", ["owner", "member", "viewer"]);
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "declined",
  "cancelled",
]);
export const fieldSource = pgEnum("field_source", ["builtin", "attribute"]);
export const fieldDataType = pgEnum("field_data_type", ["text", "number", "boolean", "date"]);
export const listStatus = pgEnum("list_status", ["active", "removed"]);
export const revisionKind = pgEnum("revision_kind", [
  "initial_import",
  "csv_update",
  "manual_edit",
  "restore",
]);
export const importKind = pgEnum("import_kind", ["initial", "update"]);
export const importStatus = pgEnum("import_status", ["draft", "committed", "discarded"]);

// ---------------------------------------------------------------------------
// 4.1 Users and access

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text().notNull().unique(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    passwordHash: text().notNull(),
    isAdmin: boolean().notNull().default(false),
    /** Set by an admin temporary password (REQ-AUTH-07). */
    mustChangePassword: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: userRef().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

/** Failed sign-in attempts, for the rate limit (REQ-AUTH-08). */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    email: text().notNull(),
    attemptedAt: createdAt(),
  },
  (t) => [index().on(t.email, t.attemptedAt)],
);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    clientName: text().notNull(),
    code: text().notNull(),
    description: text(),
    fieldStartDate: date().notNull(),
    timezone: text().notNull(),
    dateFormat: dateFormat().notNull().default("YYYY/MM/DD"),
    primaryGroupFieldKey: text(),
    companyLogoPath: text(),
    clientLogoPath: text(),
    currentRevisionId: uuid().references((): AnyPgColumn => revisions.id, {
      onDelete: "restrict",
    }),
    lastSignerExecutor: text(),
    lastSignerClient: text(),
    deletedAt: timestamptz(),
    deletedBy: userRef(),
    createdBy: userRef().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // The code identifies the project everywhere (menu, PDF, CSV, delete
    // confirmation): unique outside the trash, case-insensitively.
    uniqueIndex("projects_code_unique")
      .on(sql`lower(${t.code})`)
      .where(sql`${t.deletedAt} is null`),
    check("projects_code_trimmed", sql`${t.code} = btrim(${t.code}) and ${t.code} <> ''`),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: projectRef(),
    userId: userRef().notNull(),
    role: memberRole().notNull(),
    addedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index().on(t.userId),
    // At most one owner per project; the service layer guarantees at least one.
    uniqueIndex("project_members_one_owner")
      .on(t.projectId)
      .where(sql`${t.role} = 'owner'`),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    projectId: projectRef(),
    email: text().notNull(),
    role: memberRole().notNull(),
    status: invitationStatus().notNull().default("pending"),
    invitedBy: userRef().notNull(),
    createdAt: createdAt(),
    respondedAt: timestamptz(),
  },
  (t) => [
    index().on(t.email),
    uniqueIndex("invitations_one_pending")
      .on(t.projectId, t.email)
      .where(sql`${t.status} = 'pending'`),
    check("invitations_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("invitations_role_not_owner", sql`${t.role} <> 'owner'`),
  ],
);

// ---------------------------------------------------------------------------
// 4.2 IO list column definitions

export const projectFields = pgTable(
  "project_fields",
  {
    id: id(),
    projectId: projectRef(),
    key: text().notNull(),
    label: text().notNull(),
    source: fieldSource().notNull(),
    dataType: fieldDataType().notNull().default("text"),
    sortOrder: integer().notNull(),
    required: boolean().notNull().default(false),
    groupable: boolean().notNull().default(false),
    testRelevant: boolean().notNull().default(false),
    showInIoList: boolean().notNull().default(true),
    showInLoopCheck: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex().on(t.projectId, t.key)],
);

// ---------------------------------------------------------------------------
// 4.3 Tags, issues and revisions

export const tags = pgTable(
  "tags",
  {
    id: id(),
    projectId: projectRef(),
    /** Stored trimmed; compared case-insensitively (P-05). */
    tag: text().notNull(),
    description: text().notNull(),
    /** Upper case. */
    ioType: text().notNull(),
    loop: text(),
    pid: text(),
    rangeMin: numeric({ mode: "number" }),
    rangeMax: numeric({ mode: "number" }),
    unit: text(),
    attributes: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    inScope: boolean().notNull().default(true),
    outOfScopeReason: text(),
    listStatus: listStatus().notNull().default("active"),
    removedInRevisionId: uuid().references((): AnyPgColumn => revisions.id, {
      onDelete: "restrict",
    }),
    checkout: boolean().notNull().default(false),
    checkoutAt: timestamptz(),
    checkoutBy: userRef(),
    retestAlert: boolean().notNull().default(false),
    retestAlertReason: text(),
    clearedInId: uuid().references((): AnyPgColumn => ioListClears.id, {
      onDelete: "restrict",
    }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tags_project_tag_unique")
      .on(t.projectId, sql`lower(${t.tag})`)
      .where(sql`${t.clearedInId} is null`),
    index("tags_attributes_gin").using("gin", t.attributes),
    // Polling for changes since a timestamp (REQ-RT-01)
    index().on(t.projectId, t.updatedAt),
    check("tags_tag_trimmed", sql`${t.tag} = btrim(${t.tag}) and ${t.tag} <> ''`),
    check("tags_io_type_upper", sql`${t.ioType} = upper(${t.ioType})`),
  ],
);

export const issueTypes = pgTable(
  "issue_types",
  {
    id: id(),
    projectId: projectRef(),
    name: text().notNull(),
    sortOrder: integer().notNull(),
    archived: boolean().notNull().default(false),
  },
  (t) => [index().on(t.projectId)],
);

export const issues = pgTable(
  "issues",
  {
    id: id(),
    projectId: projectRef(),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
    issueTypeId: uuid()
      .notNull()
      .references(() => issueTypes.id, { onDelete: "restrict" }),
    description: text().notNull(),
    openedAt: timestamptz().notNull().defaultNow(),
    openedBy: userRef().notNull(),
    /** "Issue last modified". */
    updatedAt: updatedAt(),
    updatedBy: userRef().notNull(),
    resolvedAt: timestamptz(),
    resolvedBy: userRef(),
    resolutionComment: text(),
    version: version(),
  },
  (t) => [
    index().on(t.tagId),
    index().on(t.projectId, t.updatedAt),
    check("issues_description_not_blank", sql`btrim(${t.description}) <> ''`),
    check(
      "issues_resolution_consistent",
      sql`(${t.resolvedAt} is null) = (${t.resolvedBy} is null)`,
    ),
  ],
);

/** Recurring issue texts. */
export const issuePresets = pgTable(
  "issue_presets",
  {
    id: id(),
    projectId: projectRef(),
    issueTypeId: uuid()
      .notNull()
      .references(() => issueTypes.id, { onDelete: "restrict" }),
    text: text().notNull(),
    sortOrder: integer().notNull(),
  },
  (t) => [index().on(t.projectId)],
);

/** Always the latest text; no history. */
export const testProcedures = pgTable(
  "test_procedures",
  {
    projectId: projectRef(),
    ioType: text().notNull(),
    text: text().notNull(),
    updatedAt: updatedAt(),
    updatedBy: userRef().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.ioType] })],
);

export type RevisionSummary = {
  added: number;
  removed: number;
  reactivated: number;
  changed: number;
  unchanged: number;
  edited: number;
};

export const revisions = pgTable(
  "revisions",
  {
    id: id(),
    projectId: projectRef(),
    name: text().notNull(),
    kind: revisionKind().notNull(),
    summary: jsonb().$type<RevisionSummary>(),
    createdBy: userRef().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.projectId, t.createdAt)],
);

/** Trash for cleared IO lists. */
export const ioListClears = pgTable(
  "io_list_clears",
  {
    id: id(),
    projectId: projectRef(),
    clearedBy: userRef().notNull(),
    clearedAt: timestamptz().notNull().defaultNow(),
    previousRevisionId: uuid().references(() => revisions.id, { onDelete: "restrict" }),
    restoredAt: timestamptz(),
    purgedAt: timestamptz(),
  },
  (t) => [index().on(t.projectId)],
);

// ---------------------------------------------------------------------------
// 4.4 Import, reports, presence and audit

export const importDrafts = pgTable(
  "import_drafts",
  {
    id: id(),
    projectId: projectRef(),
    kind: importKind().notNull(),
    status: importStatus().notNull().default("draft"),
    fileName: text().notNull(),
    delimiter: text().notNull(),
    headers: jsonb().$type<string[]>().notNull(),
    rows: jsonb().$type<string[][]>().notNull(),
    mapping: jsonb().$type<Record<string, string>>().notNull().default({}),
    rowDecisions: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    revisionName: text(),
    createdBy: userRef().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("import_drafts_one_draft")
      .on(t.projectId)
      .where(sql`${t.status} = 'draft'`),
  ],
);

export const mappingTemplates = pgTable("mapping_templates", {
  projectId: uuid()
    .primaryKey()
    .references(() => projects.id, { onDelete: "restrict" }),
  /** CSV header → field key. */
  mapping: jsonb().$type<Record<string, string>>().notNull(),
  updatedAt: updatedAt(),
});

export const reports = pgTable(
  "reports",
  {
    id: id(),
    projectId: projectRef(),
    periodStart: date().notNull(),
    periodEnd: date().notNull(),
    groupByFieldKey: text(),
    executorName: text().notNull(),
    clientRepName: text().notNull(),
    filePath: text().notNull(),
    fileSize: integer().notNull(),
    generatedBy: userRef().notNull(),
    generatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.projectId, t.periodEnd),
    check("reports_period_order", sql`${t.periodStart} <= ${t.periodEnd}`),
  ],
);

export const presence = pgTable(
  "presence",
  {
    projectId: projectRef(),
    userId: userRef().notNull(),
    // Presence is ephemeral: losing the focus marker is harmless.
    focusedTagId: uuid().references(() => tags.id, { onDelete: "set null" }),
    lastSeenAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

/** Insert-only (REQ-AUD-03); enforced by a trigger in the migrations. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    projectId: uuid().references(() => projects.id, { onDelete: "restrict" }),
    actorId: userRef().notNull(),
    at: timestamptz().notNull().defaultNow(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    action: text().notNull(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
    revisionId: uuid().references(() => revisions.id, { onDelete: "restrict" }),
    batchId: uuid(),
  },
  (t) => [
    index().on(t.projectId, t.at),
    index().on(t.entityType, t.entityId),
    index().on(t.batchId),
    // The user's latest change: the "Recent" project in the menu
    index().on(t.actorId, t.id),
  ],
);
