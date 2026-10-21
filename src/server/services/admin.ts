/**
 * Administration (SPEC §5.3, last rows; REQ-ACC-04). Admin-only, and admins
 * get no access to project content through it (REQ-PERM-03).
 */
import { randomInt } from "node:crypto";
import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "@/server/auth/password";
import type { Db, Tx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import {
  auditLog,
  importDrafts,
  invitations,
  ioListClears,
  issuePresets,
  issues,
  issueTypes,
  mappingTemplates,
  presence,
  projectFields,
  projectMembers,
  projects,
  reports,
  revisions,
  sessions,
  tags,
  testProcedures,
  users,
} from "@/server/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { mutate } from "./mutation";
import { type Actor, requireAdmin } from "./permissions";

const id = z.uuid();

async function lockUser(tx: Tx, userId: string) {
  if (!id.safeParse(userId).success) throw new NotFoundError("User");
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
  if (!user) throw new NotFoundError("User");
  return user;
}

// ---------------------------------------------------------------------------
// Users

/** No look-alike characters (0/O, 1/l/I), so it can be read out or typed. */
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTemporaryPasswordText(length = 12): string {
  return Array.from({ length }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join("");
}

/**
 * REQ-AUTH-07. Returns the password once; only its hash is stored. The user's
 * sessions end, and the next sign-in forces a new password.
 */
export function generateTemporaryPassword(actor: Actor, userId: string, { db }: { db?: Db } = {}) {
  return mutate({
    db,
    actor,
    authorize: () => requireAdmin(actor),
    schema: z.object({}),
    input: {},
    run: async ({ tx, audit }) => {
      if (userId === actor.userId) {
        throw new ValidationError("Use Change password in My account for your own account.");
      }
      const user = await lockUser(tx, userId);
      const password = generateTemporaryPasswordText();
      const passwordHash = await hashPassword(password);

      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: true })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));

      audit({
        action: "admin.temp_password",
        entityType: "user",
        entityId: userId,
        before: { passwordHash: user.passwordHash, mustChangePassword: user.mustChangePassword },
        after: { passwordHash, mustChangePassword: true },
      });
      return { password };
    },
  });
}

/**
 * Make or remove an admin. There is always at least one admin (REQ-PERM-04,
 * applied to everyone): admin changes are serialized, so two admins removing
 * each other at once cannot leave the system without one.
 */
export function setAdmin(actor: Actor, input: unknown, { db }: { db?: Db } = {}) {
  return mutate({
    db,
    actor,
    authorize: () => requireAdmin(actor),
    schema: z.object({ userId: z.string(), isAdmin: z.boolean() }),
    input,
    run: async ({ tx, audit }, data) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('loopcheck.admins'))`);
      // The actor may have lost the role while waiting for the lock.
      const [me] = await tx
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, actor.userId));
      if (!me?.isAdmin) throw new ForbiddenError();

      const user = await lockUser(tx, data.userId);
      if (user.isAdmin === data.isAdmin) {
        throw new ValidationError(
          data.isAdmin
            ? "This user is already an administrator."
            : "This user is not an administrator.",
        );
      }
      if (!data.isAdmin) {
        const [{ admins }] = await tx
          .select({ admins: count() })
          .from(users)
          .where(eq(users.isAdmin, true));
        if (admins <= 1) {
          throw new ValidationError("There must be at least one administrator.");
        }
      }

      await tx.update(users).set({ isAdmin: data.isAdmin }).where(eq(users.id, data.userId));
      audit({
        action: "admin.set_admin",
        entityType: "user",
        entityId: data.userId,
        before: { isAdmin: user.isAdmin },
        after: { isAdmin: data.isAdmin },
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Projects

/** REQ-PROJ-05: the new owner becomes owner; the old owner becomes member. */
export function transferOwnership(actor: Actor, input: unknown, { db }: { db?: Db } = {}) {
  return mutate({
    db,
    actor,
    authorize: () => requireAdmin(actor),
    schema: z.object({ projectId: z.string(), userId: z.string() }),
    input,
    run: async ({ tx, audit }, data) => {
      if (!id.safeParse(data.projectId).success) throw new NotFoundError("Project");
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, data.projectId), isNull(projects.deletedAt)))
        .for("update");
      if (!project) throw new NotFoundError("Project");
      await lockUser(tx, data.userId);

      const [owner] = await tx
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.role, "owner")));
      if (owner?.userId === data.userId) {
        throw new ValidationError("This user already owns the project.");
      }

      // Demote first: the database allows only one owner per project.
      if (owner) {
        await tx
          .update(projectMembers)
          .set({ role: "member" })
          .where(
            and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, owner.userId)),
          );
      }
      await tx
        .insert(projectMembers)
        .values({ projectId: project.id, userId: data.userId, role: "owner" })
        .onConflictDoUpdate({
          target: [projectMembers.projectId, projectMembers.userId],
          set: { role: "owner" },
        });

      audit({
        action: "admin.transfer_ownership",
        entityType: "project",
        entityId: project.id,
        projectId: project.id,
        before: { ownerId: owner?.userId ?? null },
        after: { ownerId: data.userId },
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Trash (REQ-PROJ-04)

async function lockTrashedProject(tx: Tx, projectId: string) {
  if (!id.safeParse(projectId).success) throw new NotFoundError("Project");
  const [project] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNotNull(projects.deletedAt)))
    .for("update");
  if (!project) throw new NotFoundError("Project");
  return project;
}

/** Back to all its members, unless an active project took its code meanwhile. */
export function restoreProject(actor: Actor, projectId: string, { db }: { db?: Db } = {}) {
  return mutate({
    db,
    actor,
    authorize: () => requireAdmin(actor),
    schema: z.object({}),
    input: {},
    run: async ({ tx, audit }) => {
      const project = await lockTrashedProject(tx, projectId);
      try {
        await tx
          .update(projects)
          .set({ deletedAt: null, deletedBy: null })
          .where(eq(projects.id, projectId));
      } catch (error) {
        if (isUniqueViolation(error, "projects_code_unique")) {
          throw new ValidationError(
            `Another active project uses the code ${project.code}. Change that project's code first.`,
          );
        }
        throw error;
      }
      audit({
        action: "project.restore",
        entityType: "project",
        entityId: projectId,
        projectId,
        before: { deletedAt: project.deletedAt },
        after: { deletedAt: null },
      });
    },
  });
}

/**
 * `Delete permanently`: removes everything of a project in the trash,
 * including its audit entries (the one exception to REQ-AUD-03). A single
 * `admin.purge` entry, not linked to the project, keeps the trace.
 */
export function purgeProject(
  actor: Actor,
  projectId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return mutate({
    db,
    actor,
    authorize: () => requireAdmin(actor),
    schema: z.object({ confirmCode: z.string().trim() }),
    input,
    run: async ({ tx, audit }, { confirmCode }) => {
      const project = await lockTrashedProject(tx, projectId);
      if (confirmCode !== project.code) {
        throw new ValidationError(undefined, {
          confirmCode: ["Type the project code exactly to confirm."],
        });
      }

      // The audit_log trigger allows deletes only inside this transaction.
      await tx.execute(sql`SET LOCAL loopcheck.allow_audit_purge = 'on'`);
      // Children before parents (foreign keys are `restrict`).
      await tx.delete(auditLog).where(eq(auditLog.projectId, projectId));
      await tx.delete(presence).where(eq(presence.projectId, projectId));
      await tx.delete(reports).where(eq(reports.projectId, projectId));
      await tx.delete(importDrafts).where(eq(importDrafts.projectId, projectId));
      await tx.delete(mappingTemplates).where(eq(mappingTemplates.projectId, projectId));
      await tx.delete(issues).where(eq(issues.projectId, projectId));
      await tx.delete(issuePresets).where(eq(issuePresets.projectId, projectId));
      await tx.delete(issueTypes).where(eq(issueTypes.projectId, projectId));
      await tx.delete(testProcedures).where(eq(testProcedures.projectId, projectId));
      await tx.update(projects).set({ currentRevisionId: null }).where(eq(projects.id, projectId));
      await tx.delete(tags).where(eq(tags.projectId, projectId));
      await tx.delete(ioListClears).where(eq(ioListClears.projectId, projectId));
      await tx.delete(revisions).where(eq(revisions.projectId, projectId));
      await tx.delete(projectFields).where(eq(projectFields.projectId, projectId));
      await tx.delete(invitations).where(eq(invitations.projectId, projectId));
      await tx.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
      await tx.delete(projects).where(eq(projects.id, projectId));

      audit({
        action: "admin.purge",
        entityType: "project",
        entityId: projectId,
        projectId: null,
        before: { code: project.code, clientName: project.clientName },
        after: null,
      });
    },
  });
}
