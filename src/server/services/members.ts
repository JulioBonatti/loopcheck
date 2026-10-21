/**
 * Project membership and invitations (SPEC §5.4). The owner invites, changes
 * roles and removes members; the invited user accepts or declines. No e-mail
 * is sent (§17): invitations show up in My account, matched by e-mail.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db, Tx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import { invitations, projectMembers, projects, users } from "@/server/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { mutate } from "./mutation";
import { type Actor, requireProjectPermission } from "./permissions";

/** Roles an owner can give; ownership moves only by admin transfer (step 8). */
const assignableRole = z.enum(["member", "viewer"], "Choose a role.");
const id = z.uuid();

/** Owners cannot leave: they hand the project over first (SPEC §5.3). */
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

// ---------------------------------------------------------------------------
// Owner side (REQ-MEM-01, REQ-MEM-04)

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: assignableRole,
});

/** REQ-MEM-01. The account may not exist yet (REQ-MEM-03). */
export function inviteMember(
  actor: Actor,
  projectId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return mutate({
    db,
    actor,
    authorize: (tx) => requireProjectPermission(tx, actor, projectId, "members.manage"),
    schema: inviteSchema,
    input,
    run: async ({ tx, audit }, data) => {
      const [member] = await tx
        .select({ id: users.id })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(and(eq(projectMembers.projectId, projectId), eq(users.email, data.email)));
      if (member) {
        throw new ValidationError(undefined, { email: ["This person is already a member."] });
      }
      const [removed] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, data.email), isNotNull(users.deactivatedAt)));
      if (removed) {
        throw new ValidationError(undefined, {
          email: ["This account was removed by an administrator."],
        });
      }

      let invitation;
      try {
        [invitation] = await tx
          .insert(invitations)
          .values({ projectId, email: data.email, role: data.role, invitedBy: actor.userId })
          .returning();
      } catch (error) {
        if (isUniqueViolation(error, "invitations_one_pending")) {
          throw new ValidationError(undefined, {
            email: ["This email already has a pending invitation."],
          });
        }
        throw error;
      }

      audit({
        action: "member.invite",
        entityType: "invitation",
        entityId: invitation.id,
        projectId,
        after: data,
      });
      return invitation;
    },
  });
}

/** Locks an invitation row, so answering and cancelling cannot both win. */
async function lockInvitation(tx: Tx, invitationId: string) {
  if (!id.safeParse(invitationId).success) throw new NotFoundError("Invitation");
  const [invitation] = await tx
    .select()
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .for("update");
  if (!invitation) throw new NotFoundError("Invitation");
  return invitation;
}

function assertPending(invitation: { status: string }) {
  if (invitation.status !== "pending") {
    throw new ValidationError("This invitation is no longer pending.");
  }
}

/** REQ-MEM-04: the owner withdraws a pending invitation. */
export function cancelInvitation(
  actor: Actor,
  projectId: string,
  invitationId: string,
  { db }: { db?: Db } = {},
) {
  return mutate({
    db,
    actor,
    authorize: (tx) => requireProjectPermission(tx, actor, projectId, "members.manage"),
    schema: z.object({}),
    input: {},
    run: async ({ tx, audit }) => {
      const invitation = await lockInvitation(tx, invitationId);
      if (invitation.projectId !== projectId) throw new NotFoundError("Invitation");
      assertPending(invitation);
      await tx
        .update(invitations)
        .set({ status: "cancelled", respondedAt: new Date() })
        .where(eq(invitations.id, invitationId));
      audit({
        action: "member.invite_cancel",
        entityType: "invitation",
        entityId: invitationId,
        projectId,
        before: { status: "pending" },
        after: { status: "cancelled" },
      });
    },
  });
}

/** The membership of another user, locked; the owner's own row is off limits. */
async function lockOtherMember(tx: Tx, projectId: string, userId: string) {
  if (!id.safeParse(userId).success) throw new NotFoundError("Member");
  const [member] = await tx
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .for("update");
  if (!member) throw new NotFoundError("Member");
  if (member.role === "owner") {
    throw new ForbiddenError(
      "The owner's role cannot be changed here. An administrator can transfer ownership.",
    );
  }
  return member;
}

/** REQ-MEM-04: between member and viewer. */
export function changeMemberRole(
  actor: Actor,
  projectId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return mutate({
    db,
    actor,
    authorize: (tx) => requireProjectPermission(tx, actor, projectId, "members.manage"),
    schema: z.object({ userId: z.string(), role: assignableRole }),
    input,
    run: async ({ tx, audit }, data) => {
      const before = await lockOtherMember(tx, projectId, data.userId);
      await tx
        .update(projectMembers)
        .set({ role: data.role })
        .where(
          and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, data.userId)),
        );
      audit({
        action: "member.role_change",
        entityType: "project_member",
        entityId: data.userId,
        projectId,
        before,
        after: { role: data.role },
      });
    },
  });
}

/**
 * REQ-MEM-04. History keeps the person's name (audit entries point to
 * `users`), and they can be invited again later.
 */
export function removeMember(
  actor: Actor,
  projectId: string,
  userId: string,
  { db }: { db?: Db } = {},
) {
  return mutate({
    db,
    actor,
    authorize: (tx) => requireProjectPermission(tx, actor, projectId, "members.manage"),
    schema: z.object({}),
    input: {},
    run: async ({ tx, audit }) => {
      const before = await lockOtherMember(tx, projectId, userId);
      await tx
        .delete(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
      audit({
        action: "member.remove",
        entityType: "project_member",
        entityId: userId,
        projectId,
        before,
        after: null,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Invited user's side (REQ-MEM-02)

/**
 * Accept or decline one of the actor's own pending invitations. Accepting
 * makes them a member with the invitation's role.
 */
export function respondToInvitation(
  actor: Actor,
  invitationId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return mutate({
    db,
    actor,
    // Only the person the invitation was sent to may answer it.
    authorize: async (tx) => {
      const invitation = await lockInvitation(tx, invitationId);
      const [me] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, actor.userId));
      // Someone else's invitation: reveal nothing about it.
      if (me?.email !== invitation.email) throw new NotFoundError("Invitation");
      assertPending(invitation);
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, invitation.projectId), isNull(projects.deletedAt)));
      if (!project) throw new NotFoundError("Project");
      return invitation;
    },
    schema: z.object({ accept: z.boolean() }),
    input,
    run: async ({ tx, access: invitation, audit }, { accept }) => {
      const status = accept ? "accepted" : "declined";
      if (accept) {
        const [already] = await tx
          .select({ role: projectMembers.role })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, invitation.projectId),
              eq(projectMembers.userId, actor.userId),
            ),
          );
        if (already) throw new ValidationError("You are already a member of this project.");
        await tx.insert(projectMembers).values({
          projectId: invitation.projectId,
          userId: actor.userId,
          role: invitation.role,
        });
      }
      await tx
        .update(invitations)
        .set({ status, respondedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      audit({
        action: accept ? "member.accept" : "member.decline",
        entityType: "invitation",
        entityId: invitation.id,
        projectId: invitation.projectId,
        before: { status: "pending" },
        after: { status, ...(accept && { role: invitation.role }) },
      });
    },
  });
}
