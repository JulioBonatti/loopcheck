/**
 * Project membership (SPEC §5.4). Invitations and member management come in
 * step 7.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db";
import { projectMembers } from "@/server/db/schema";
import { mutate } from "./mutation";
import { type Actor, requireProjectPermission } from "./permissions";

/**
 * `Leave project` (REQ-ACC-01). Owners cannot leave: they hand the project
 * over first (SPEC §5.3). The membership row is removed; the history still
 * shows the person's name, since audit entries point to `users`.
 */
export function leaveProject(actor: Actor, projectId: string, { db }: { db?: Db } = {}) {
  return mutate({
    db,
    actor,
    authorize: (tx) => requireProjectPermission(tx, actor, projectId, "project.leave"),
    schema: z.object({}),
    input: {},
    run: async ({ tx, access, audit }) => {
      await tx
        .delete(projectMembers)
        .where(
          and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actor.userId)),
        );
      audit({
        action: "member.leave",
        entityType: "project_member",
        entityId: actor.userId,
        projectId,
        before: { role: access.role },
        after: null,
      });
    },
  });
}
