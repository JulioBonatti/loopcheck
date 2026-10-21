/**
 * Project settings sections (REQ-SET-03…06). Each section is saved as a whole
 * with its `Save` button: the client sends the desired state and the token of
 * the state it started from; if someone saved the section meanwhile, the save
 * is refused (rule 5). Owners and members only.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ALWAYS_REQUIRED,
  type FieldDataType,
  fieldDataTypes,
  fieldKeyFromLabel,
} from "@/lib/fields";
import { convertValue } from "@/lib/values";
import type { Db, Tx } from "@/server/db";
import {
  issuePresets,
  issueTypes,
  projectFields,
  projects,
  tags,
  testProcedures,
} from "@/server/db/schema";
import {
  readColumns,
  readIssueTypes,
  readPresets,
  readProcedures,
} from "@/server/queries/settings";
import { type AuditEntry, diffFields } from "./audit";
import { ValidationError } from "./errors";
import { mutate } from "./mutation";
import { type Actor, requireProjectPermission } from "./permissions";

const STALE = "Someone else changed these settings meanwhile. Reload the page and try again.";

/** A row from the client: an existing id, or a temporary id for a new row. */
const rowRef = z.object({ id: z.uuid().optional(), tempId: z.string().optional() });

type Audit = (entry: Omit<AuditEntry, "projectId" | "batchId">) => void;

/**
 * Runs a section save: permission, Zod, a lock on the project's settings and
 * the token check. Entries share a batch id; a save that changes nothing is
 * refused ("Nothing to save.").
 */
function saveSection<S extends z.ZodType<{ token: string }>>(
  actor: Actor,
  projectId: string,
  schema: S,
  input: unknown,
  read: (tx: Tx) => Promise<{ token: string }>,
  apply: (tx: Tx, data: z.output<S>, audit: Audit) => Promise<void>,
  db?: Db,
) {
  return mutate({
    db,
    actor,
    authorize: (tx) => requireProjectPermission(tx, actor, projectId, "settings.edit"),
    schema,
    input,
    run: async ({ tx, audit }, data) => {
      // One settings save at a time per project, then compare tokens.
      await tx.execute(
        sql`SELECT 1 FROM ${projects} WHERE ${projects.id} = ${projectId} FOR UPDATE`,
      );
      if ((await read(tx)).token !== data.token) throw new ValidationError(STALE);

      const batchId = randomUUID();
      let changes = 0;
      await apply(tx, data, (entry) => {
        const diff = diffFields(entry.before ?? null, entry.after ?? null);
        const isUpdate = entry.before && entry.after;
        if (isUpdate && Object.keys(diff.after ?? {}).length === 0) return;
        changes += 1;
        audit({ ...entry, projectId, batchId });
      });
      if (changes === 0) throw new ValidationError("Nothing to save.");
    },
  });
}

// ---------------------------------------------------------------------------
// Columns (REQ-SET-03)

const columnsSchema = z.object({
  token: z.string(),
  /** Every column to keep, in the desired order. */
  fields: z.array(
    rowRef.extend({
      label: z.string().trim().min(1, "Label is required.").max(100, "Label is too long."),
      dataType: z.enum(fieldDataTypes),
      required: z.boolean(),
      groupable: z.boolean(),
      testRelevant: z.boolean(),
      showInIoList: z.boolean(),
      showInLoopCheck: z.boolean(),
    }),
  ),
  deletedIds: z.array(z.uuid()),
  /** The primary grouping ("Area"): an id or temporary id from `fields`, or null. */
  primaryGroup: z.string().nullable(),
});

const EDITABLE = [
  "label",
  "dataType",
  "required",
  "groupable",
  "testRelevant",
  "showInIoList",
  "showInLoopCheck",
] as const;

/** Tags with a value for an attribute (cleared ones included: they may be restored). */
function tagsWithValue(tx: Tx, projectId: string, key: string) {
  return tx
    .select({ id: tags.id, tag: tags.tag, value: sql<unknown>`${tags.attributes} -> ${key}` })
    .from(tags)
    .where(
      and(
        eq(tags.projectId, projectId),
        sql`nullif(${tags.attributes} ->> ${key}, '') is not null`,
      ),
    );
}

function tagList(names: string[]): string {
  const shown = names.slice(0, 10).join(", ");
  return names.length > 10 ? `${shown} and ${names.length - 10} more` : shown;
}

/**
 * Changing an attribute's type converts its stored values; if any does not
 * convert, the change is refused and the tags are listed (SPEC §4.2).
 */
async function convertAttribute(
  tx: Tx,
  projectId: string,
  field: { key: string; label: string },
  type: FieldDataType,
) {
  const rows = await tagsWithValue(tx, projectId, field.key);
  const converted = rows.map((r) => ({ ...r, result: convertValue(r.value, type) }));
  const failed = converted.filter((r) => !r.result.ok).map((r) => r.tag);
  if (failed.length > 0) {
    throw new ValidationError(
      `“${field.label}” cannot become ${type}: ${failed.length} tag(s) have values that do not convert (${tagList(failed)}).`,
    );
  }
  for (const r of converted) {
    if (!r.result.ok) continue;
    await tx
      .update(tags)
      .set({
        attributes: sql`jsonb_set(${tags.attributes}, array[${field.key}]::text[], ${JSON.stringify(r.result.value)}::jsonb)`,
        version: sql`${tags.version} + 1`,
      })
      .where(eq(tags.id, r.id));
  }
}

export function saveColumns(
  actor: Actor,
  projectId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return saveSection(
    actor,
    projectId,
    columnsSchema,
    input,
    (tx) => readColumns(tx, projectId),
    async (tx, data, audit) => {
      const { fields: current, primaryGroupFieldKey } = await readColumns(tx, projectId);
      const byId = new Map(current.map((f, i) => [f.id, { ...f, sortOrder: i + 1 }]));

      // Every existing column must be kept or removed, and labels stay unique.
      const accounted = new Set([...data.fields.flatMap((f) => f.id ?? []), ...data.deletedIds]);
      if (accounted.size !== current.length || current.some((f) => !accounted.has(f.id))) {
        throw new ValidationError(STALE);
      }
      const labels = new Set<string>();
      for (const f of data.fields) {
        if (labels.has(f.label.toLowerCase())) {
          throw new ValidationError(`Two columns are called “${f.label}”.`);
        }
        labels.add(f.label.toLowerCase());
      }

      // Removed: attribute columns only, and only while no tag has a value.
      for (const id of data.deletedIds) {
        const field = byId.get(id)!;
        if (field.source === "builtin") {
          throw new ValidationError(`“${field.label}” is a built-in column and cannot be removed.`);
        }
        const used = await tagsWithValue(tx, projectId, field.key);
        if (used.length > 0) {
          throw new ValidationError(
            `“${field.label}” has values in ${used.length} tag(s) and cannot be removed. Hide it instead.`,
          );
        }
      }
      if (data.deletedIds.length > 0) {
        await tx.delete(projectFields).where(inArray(projectFields.id, data.deletedIds));
        for (const id of data.deletedIds) {
          audit({
            action: "settings.field_delete",
            entityType: "project_field",
            entityId: id,
            before: byId.get(id)!,
          });
        }
      }

      const taken = current.map((f) => f.key);
      const keyOf = new Map<string, string>(); // id or temporary id → key
      for (const [index, f] of data.fields.entries()) {
        const sortOrder = index + 1;
        const values = {
          label: f.label,
          dataType: f.dataType,
          required: f.required,
          groupable: f.groupable,
          testRelevant: f.testRelevant,
          showInIoList: f.showInIoList,
          showInLoopCheck: f.showInLoopCheck,
          sortOrder,
        };

        if (f.id) {
          const before = byId.get(f.id);
          if (!before) throw new ValidationError(STALE);
          keyOf.set(f.id, before.key);
          if (before.source === "builtin" && f.dataType !== before.dataType) {
            throw new ValidationError(`The data type of “${before.label}” cannot change.`);
          }
          if (ALWAYS_REQUIRED.has(before.key)) values.required = true;
          if (f.dataType !== before.dataType) {
            await convertAttribute(tx, projectId, before, f.dataType);
          }
          await tx.update(projectFields).set(values).where(eq(projectFields.id, f.id));
          const old = Object.fromEntries(
            [...EDITABLE, "sortOrder" as const].map((k) => [k, before[k]]),
          );
          audit({
            action: "settings.field_update",
            entityType: "project_field",
            entityId: f.id,
            before: old,
            after: values,
          });
        } else {
          const key = fieldKeyFromLabel(f.label, taken);
          taken.push(key);
          if (f.tempId) keyOf.set(f.tempId, key);
          const [created] = await tx
            .insert(projectFields)
            .values({ ...values, projectId, key, source: "attribute" })
            .returning({ id: projectFields.id });
          audit({
            action: "settings.field_create",
            entityType: "project_field",
            entityId: created.id,
            after: { key, ...values },
          });
        }
      }

      // Primary grouping ("Area"): a groupable column, or none.
      let primaryKey: string | null = null;
      if (data.primaryGroup) {
        const field = data.fields.find((f) => (f.id ?? f.tempId) === data.primaryGroup);
        primaryKey = keyOf.get(data.primaryGroup) ?? null;
        if (!field || !primaryKey) throw new ValidationError(STALE);
        if (!field.groupable) {
          throw new ValidationError(
            `“${field.label}” must be groupable to be the primary grouping.`,
          );
        }
      }
      if (primaryKey !== primaryGroupFieldKey) {
        await tx
          .update(projects)
          .set({ primaryGroupFieldKey: primaryKey })
          .where(eq(projects.id, projectId));
        audit({
          action: "settings.primary_group",
          entityType: "project",
          entityId: projectId,
          before: { primaryGroupFieldKey },
          after: { primaryGroupFieldKey: primaryKey },
        });
      }
    },
    db,
  );
}

// ---------------------------------------------------------------------------
// Issue types (REQ-SET-04)

const issueTypesSchema = z.object({
  token: z.string(),
  /** Every type, in the desired order. Types are archived, never deleted. */
  types: z.array(
    rowRef.extend({
      name: z.string().trim().min(1, "Name is required.").max(50, "Name is too long."),
      archived: z.boolean(),
    }),
  ),
});

export function saveIssueTypes(
  actor: Actor,
  projectId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return saveSection(
    actor,
    projectId,
    issueTypesSchema,
    input,
    (tx) => readIssueTypes(tx, projectId),
    async (tx, data, audit) => {
      const { types: current } = await readIssueTypes(tx, projectId);
      const byId = new Map(current.map((t, i) => [t.id, { ...t, sortOrder: i + 1 }]));
      const sent = new Set(data.types.flatMap((t) => t.id ?? []));
      if (sent.size !== current.length || current.some((t) => !sent.has(t.id))) {
        throw new ValidationError(STALE);
      }
      const names = new Set<string>();
      for (const t of data.types) {
        if (names.has(t.name.toLowerCase())) {
          throw new ValidationError(`Two issue types are called “${t.name}”.`);
        }
        names.add(t.name.toLowerCase());
      }
      if (!data.types.some((t) => !t.archived)) {
        throw new ValidationError("Keep at least one active issue type.");
      }

      for (const [index, t] of data.types.entries()) {
        const values = { name: t.name, archived: t.archived, sortOrder: index + 1 };
        if (t.id) {
          const before = byId.get(t.id);
          if (!before) throw new ValidationError(STALE);
          await tx.update(issueTypes).set(values).where(eq(issueTypes.id, t.id));
          audit({
            action: "settings.issue_type_update",
            entityType: "issue_type",
            entityId: t.id,
            before: { name: before.name, archived: before.archived, sortOrder: before.sortOrder },
            after: values,
          });
        } else {
          const [created] = await tx
            .insert(issueTypes)
            .values({ ...values, projectId })
            .returning({ id: issueTypes.id });
          audit({
            action: "settings.issue_type_create",
            entityType: "issue_type",
            entityId: created.id,
            after: values,
          });
        }
      }
    },
    db,
  );
}

// ---------------------------------------------------------------------------
// Presets (REQ-SET-05)

const presetsSchema = z.object({
  token: z.string(),
  /** Every preset to keep, in the desired order. */
  presets: z.array(
    rowRef.extend({
      issueTypeId: z.uuid("Choose an issue type."),
      text: z.string().trim().min(1, "Text is required.").max(1000, "Text is too long."),
    }),
  ),
  deletedIds: z.array(z.uuid()),
});

export function savePresets(
  actor: Actor,
  projectId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return saveSection(
    actor,
    projectId,
    presetsSchema,
    input,
    (tx) => readPresets(tx, projectId),
    async (tx, data, audit) => {
      const { presets: current } = await readPresets(tx, projectId);
      const byId = new Map(current.map((p, i) => [p.id, { ...p, sortOrder: i + 1 }]));
      const accounted = new Set([...data.presets.flatMap((p) => p.id ?? []), ...data.deletedIds]);
      if (accounted.size !== current.length || current.some((p) => !accounted.has(p.id))) {
        throw new ValidationError(STALE);
      }
      // Types must belong to the project (archived ones are allowed: shown with a warning).
      const types = await tx
        .select({ id: issueTypes.id })
        .from(issueTypes)
        .where(eq(issueTypes.projectId, projectId));
      const typeIds = new Set(types.map((t) => t.id));
      if (data.presets.some((p) => !typeIds.has(p.issueTypeId))) throw new ValidationError(STALE);

      if (data.deletedIds.length > 0) {
        await tx.delete(issuePresets).where(inArray(issuePresets.id, data.deletedIds));
        for (const id of data.deletedIds) {
          const before = byId.get(id)!;
          audit({
            action: "settings.preset_delete",
            entityType: "issue_preset",
            entityId: id,
            before: { issueTypeId: before.issueTypeId, text: before.text },
          });
        }
      }
      for (const [index, p] of data.presets.entries()) {
        const values = { issueTypeId: p.issueTypeId, text: p.text, sortOrder: index + 1 };
        if (p.id) {
          const before = byId.get(p.id);
          if (!before) throw new ValidationError(STALE);
          await tx.update(issuePresets).set(values).where(eq(issuePresets.id, p.id));
          audit({
            action: "settings.preset_update",
            entityType: "issue_preset",
            entityId: p.id,
            before: {
              issueTypeId: before.issueTypeId,
              text: before.text,
              sortOrder: before.sortOrder,
            },
            after: values,
          });
        } else {
          const [created] = await tx
            .insert(issuePresets)
            .values({ ...values, projectId })
            .returning({ id: issuePresets.id });
          audit({
            action: "settings.preset_create",
            entityType: "issue_preset",
            entityId: created.id,
            after: values,
          });
        }
      }
    },
    db,
  );
}

// ---------------------------------------------------------------------------
// Test procedures (REQ-SET-06)

const proceduresSchema = z.object({
  token: z.string(),
  /** IO type → text. An empty text removes the procedure (there is no history). */
  procedures: z.record(
    z.string().trim().toUpperCase().min(1),
    z.string().trim().max(20000, "Text is too long."),
  ),
});

export function saveProcedures(
  actor: Actor,
  projectId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return saveSection(
    actor,
    projectId,
    proceduresSchema,
    input,
    (tx) => readProcedures(tx, projectId),
    async (tx, data, audit) => {
      const { procedures: current } = await readProcedures(tx, projectId);
      const before = new Map(current.map((p) => [p.ioType, p.text]));

      for (const [ioType, text] of Object.entries(data.procedures)) {
        const old = before.get(ioType) ?? "";
        if (text === old) continue;
        if (text === "") {
          await tx
            .delete(testProcedures)
            .where(and(eq(testProcedures.projectId, projectId), eq(testProcedures.ioType, ioType)));
        } else {
          await tx
            .insert(testProcedures)
            .values({ projectId, ioType, text, updatedBy: actor.userId })
            .onConflictDoUpdate({
              target: [testProcedures.projectId, testProcedures.ioType],
              set: { text, updatedBy: actor.userId, updatedAt: new Date() },
            });
        }
        audit({
          action: "settings.procedure_update",
          entityType: "test_procedure",
          entityId: ioType,
          before: { text: old || null },
          after: { text: text || null },
        });
      }
    },
    db,
  );
}
