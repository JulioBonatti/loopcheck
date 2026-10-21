/**
 * Project settings sections (REQ-SET-03…06). Each section comes with a
 * `token`, a fingerprint of what was read: saving a section sends it back,
 * and the save is refused if someone else changed the section meanwhile
 * (rule 5: nothing is overwritten silently).
 */
import { createHash } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { FieldDataType } from "@/lib/fields";
import { stableJson } from "@/lib/json";
import type { Db, Tx } from "@/server/db";
import {
  issuePresets,
  issueTypes,
  projectFields,
  projects,
  tags,
  testProcedures,
  users,
} from "@/server/db/schema";

type Conn = Db | Tx;

export function sectionToken(state: unknown): string {
  return createHash("sha256").update(stableJson(state)).digest("base64url").slice(0, 22);
}

// ---------------------------------------------------------------------------
// Columns (REQ-SET-03)

export type FieldRow = {
  id: string;
  key: string;
  label: string;
  source: "builtin" | "attribute";
  dataType: FieldDataType;
  required: boolean;
  groupable: boolean;
  testRelevant: boolean;
  showInIoList: boolean;
  showInLoopCheck: boolean;
};

export type ColumnsState = {
  fields: FieldRow[];
  primaryGroupFieldKey: string | null;
  token: string;
};

export async function readColumns(conn: Conn, projectId: string): Promise<ColumnsState> {
  const [fields, [project]] = await Promise.all([
    conn
      .select({
        id: projectFields.id,
        key: projectFields.key,
        label: projectFields.label,
        source: projectFields.source,
        dataType: projectFields.dataType,
        required: projectFields.required,
        groupable: projectFields.groupable,
        testRelevant: projectFields.testRelevant,
        showInIoList: projectFields.showInIoList,
        showInLoopCheck: projectFields.showInLoopCheck,
      })
      .from(projectFields)
      .where(eq(projectFields.projectId, projectId))
      .orderBy(asc(projectFields.sortOrder), asc(projectFields.key)),
    conn
      .select({ primaryGroupFieldKey: projects.primaryGroupFieldKey })
      .from(projects)
      .where(eq(projects.id, projectId)),
  ]);
  const primaryGroupFieldKey = project?.primaryGroupFieldKey ?? null;
  return { fields, primaryGroupFieldKey, token: sectionToken({ fields, primaryGroupFieldKey }) };
}

// ---------------------------------------------------------------------------
// Issue types (REQ-SET-04)

export type IssueTypeRow = { id: string; name: string; archived: boolean };
export type IssueTypesState = { types: IssueTypeRow[]; token: string };

export async function readIssueTypes(conn: Conn, projectId: string): Promise<IssueTypesState> {
  const types = await conn
    .select({ id: issueTypes.id, name: issueTypes.name, archived: issueTypes.archived })
    .from(issueTypes)
    .where(eq(issueTypes.projectId, projectId))
    .orderBy(asc(issueTypes.sortOrder), asc(issueTypes.name));
  return { types, token: sectionToken(types) };
}

// ---------------------------------------------------------------------------
// Presets (REQ-SET-05)

export type PresetRow = { id: string; issueTypeId: string; text: string };
export type PresetsState = { presets: PresetRow[]; token: string };

export async function readPresets(conn: Conn, projectId: string): Promise<PresetsState> {
  const presets = await conn
    .select({ id: issuePresets.id, issueTypeId: issuePresets.issueTypeId, text: issuePresets.text })
    .from(issuePresets)
    .where(eq(issuePresets.projectId, projectId))
    .orderBy(asc(issuePresets.sortOrder), asc(issuePresets.text));
  return { presets, token: sectionToken(presets) };
}

// ---------------------------------------------------------------------------
// Test procedures (REQ-SET-06)

export type ProcedureRow = {
  ioType: string;
  text: string;
  /** Present in the IO list (active, not cleared). */
  inIoList: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
};
export type ProceduresState = { procedures: ProcedureRow[]; token: string };

/** One row per IO type in the IO list, plus saved texts of IO types no longer in it. */
export async function readProcedures(conn: Conn, projectId: string): Promise<ProceduresState> {
  const [ioTypes, saved] = await Promise.all([
    conn
      .selectDistinct({ ioType: tags.ioType })
      .from(tags)
      .where(
        and(eq(tags.projectId, projectId), eq(tags.listStatus, "active"), isNull(tags.clearedInId)),
      ),
    conn
      .select({
        ioType: testProcedures.ioType,
        text: testProcedures.text,
        updatedAt: testProcedures.updatedAt,
        updatedBy: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      })
      .from(testProcedures)
      .innerJoin(users, eq(users.id, testProcedures.updatedBy))
      .where(eq(testProcedures.projectId, projectId)),
  ]);
  const present = new Set(ioTypes.map((t) => t.ioType));
  const byType = new Map(saved.map((p) => [p.ioType, p]));
  const all = [...new Set([...present, ...byType.keys()])].sort();
  const procedures = all.map((ioType) => {
    const p = byType.get(ioType);
    return {
      ioType,
      text: p?.text ?? "",
      inIoList: present.has(ioType),
      updatedBy: p?.updatedBy ?? null,
      updatedAt: p?.updatedAt ?? null,
    };
  });
  return {
    procedures,
    token: sectionToken(procedures.map(({ ioType, text }) => ({ ioType, text }))),
  };
}
