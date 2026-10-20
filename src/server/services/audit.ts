/**
 * Audit trail (SPEC §12). Entries are written by `mutate` inside the same
 * transaction as the change they describe (ARQ-01).
 */
import type { Tx } from "@/server/db";
import { auditLog } from "@/server/db/schema";

type Row = Record<string, unknown>;

/** Bookkeeping columns that change on every write and say nothing new. */
const IGNORED_FIELDS = new Set(["updatedAt", "version"]);

/** Secrets are never written to the audit log (REQ-AUTH-03, rule 9). */
const REDACTED_FIELDS = new Set(["passwordHash", "tokenHash"]);
export const REDACTED = "[redacted]";

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value === undefined ? null : value;
}

/** JSON with object keys sorted: Postgres jsonb does not keep key order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  const [x, y] = [normalize(a), normalize(b)];
  if (x === y) return true;
  // jsonb values (attributes, summaries): compare by content
  if (typeof x === "object" && typeof y === "object" && x !== null && y !== null) {
    return stableJson(x) === stableJson(y);
  }
  return false;
}

/**
 * Only the fields that changed (REQ-AUD-01). Pass `null` as `before` for a
 * creation or as `after` for a removal: every field is then recorded.
 */
export function diffFields(
  before: Row | null,
  after: Row | null,
): { before: Row | null; after: Row | null } {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changedBefore: Row = {};
  const changedAfter: Row = {};
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const [a, b] = [before?.[key], after?.[key]];
    if (before && after && sameValue(a, b)) continue;
    const redact = REDACTED_FIELDS.has(key);
    if (before) changedBefore[key] = redact ? REDACTED : normalize(a);
    if (after) changedAfter[key] = redact ? REDACTED : normalize(b);
  }
  return { before: before && changedBefore, after: after && changedAfter };
}

export type AuditEntry = {
  /** e.g. `tag.checkout`, `project.create` (REQ-AUD-01). */
  action: string;
  entityType: string;
  entityId: string;
  projectId?: string | null;
  before?: Row | null;
  after?: Row | null;
  revisionId?: string | null;
  /** Groups the entries of one bulk operation (REQ-AUD-02). */
  batchId?: string | null;
};

/**
 * Inserts audit entries. `before`/`after` are reduced to the changed fields;
 * an update that changed nothing is not recorded.
 */
export async function writeAudit(tx: Tx, actorId: string, entries: AuditEntry[]): Promise<void> {
  const rows = [];
  for (const entry of entries) {
    const diff = diffFields(entry.before ?? null, entry.after ?? null);
    const isUpdate = entry.before && entry.after;
    if (isUpdate && Object.keys(diff.after ?? {}).length === 0) continue;
    rows.push({
      actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      projectId: entry.projectId ?? null,
      before: diff.before,
      after: diff.after,
      revisionId: entry.revisionId ?? null,
      batchId: entry.batchId ?? null,
    });
  }
  // Bulk operations may produce thousands of entries: insert in chunks.
  for (let i = 0; i < rows.length; i += 1000) {
    await tx.insert(auditLog).values(rows.slice(i, i + 1000));
  }
}
