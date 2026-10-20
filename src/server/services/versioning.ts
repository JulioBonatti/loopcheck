/**
 * Optimistic concurrency for `tags` and `issues` (ARQ-04, REQ-RT-04, rule 5).
 * An update only applies if the row still has the version the client read;
 * otherwise it is refused with a `ConflictError` — never silently overwritten.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { auditLog, issues, tags, users } from "@/server/db/schema";
import { ConflictError, type ConflictInfo, NotFoundError } from "./errors";

const TABLES = { tag: tags, issue: issues } as const;
type Entity = keyof typeof TABLES;
type Table<E extends Entity> = (typeof TABLES)[E];

type Changes<E extends Entity> = Omit<
  Partial<Table<E>["$inferInsert"]>,
  "id" | "projectId" | "version" | "createdAt"
>;

export type VersionedUpdate<E extends Entity> = {
  entity: E;
  id: string;
  /** Scopes the row to the project the actor was authorized for. */
  projectId: string;
  /** The version the client read. */
  expectedVersion: number;
  changes: Changes<E>;
};

/**
 * Applies `changes` and bumps `version`. Returns the row before and after the
 * change (for the audit entry).
 */
export async function updateVersioned<E extends Entity>(
  tx: Tx,
  { entity, id, projectId, expectedVersion, changes }: VersionedUpdate<E>,
): Promise<{ before: Table<E>["$inferSelect"]; after: Table<E>["$inferSelect"] }> {
  // Drizzle cannot narrow a union of tables; the public signature stays typed.
  const table = TABLES[entity] as typeof tags;
  const scope = and(eq(table.id, id), eq(table.projectId, projectId));

  // Lock the row so `before` is exactly what this update replaces.
  const [before] = await tx.select().from(table).where(scope).for("update");
  if (!before) throw new NotFoundError(entity === "tag" ? "Tag" : "Issue");
  if (before.version !== expectedVersion) {
    throw new ConflictError(entity, await lastChange(tx, entity, id, before.updatedAt));
  }

  const [after] = await tx
    .update(table)
    .set({ ...(changes as Changes<"tag">), version: sql`${table.version} + 1` })
    .where(scope)
    .returning();
  return { before, after } as { before: Table<E>["$inferSelect"]; after: Table<E>["$inferSelect"] };
}

/**
 * Who made the latest change to a row, from the audit log. Services must audit
 * tags and issues with `entityType` "tag" / "issue" for this to find them.
 */
async function lastChange(
  tx: Tx,
  entity: Entity,
  id: string,
  updatedAt: Date,
): Promise<ConflictInfo> {
  const [last] = await tx
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.entityType, entity), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.id))
    .limit(1);
  return {
    changedBy: last ? `${last.firstName} ${last.lastName}` : null,
    changedAt: updatedAt,
  };
}
