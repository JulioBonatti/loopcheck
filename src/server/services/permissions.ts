/**
 * Server-side permission checks (ARQ-02, REQ-PERM-01). Every service calls
 * one of these before touching data; hiding a button is not protection.
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { type ProjectPermission, type ProjectRole, roleCan } from "@/lib/permissions";
import type { Db, Tx } from "@/server/db";
import { projectMembers, projects } from "@/server/db/schema";
import { ForbiddenError, NotFoundError } from "./errors";

/** The signed-in user performing an action. */
export type Actor = { userId: string; isAdmin: boolean };

export type ProjectAccess = { projectId: string; role: ProjectRole };

/**
 * Checks that the actor is a member of a non-deleted project with a role that
 * allows `permission`. Admins get no implicit access (REQ-PERM-03).
 */
export async function requireProjectPermission(
  db: Db | Tx,
  actor: Actor,
  projectId: string,
  permission: ProjectPermission,
): Promise<ProjectAccess> {
  // A malformed id would make Postgres fail with a cast error.
  if (!z.uuid().safeParse(projectId).success) throw new NotFoundError("Project");

  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projects)
    .leftJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.userId)),
    )
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));

  if (!row) throw new NotFoundError("Project");
  if (!row.role || !roleCan(row.role, permission)) throw new ForbiddenError();
  return { projectId, role: row.role };
}

/** Admin-only actions (SPEC §5.3, last rows). */
export function requireAdmin(actor: Actor): void {
  if (!actor.isAdmin) throw new ForbiddenError();
}
