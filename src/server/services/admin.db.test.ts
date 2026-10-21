import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { actorOf, addMember, createTag, createUser } from "@/server/db/fixtures";
import {
  auditLog,
  invitations,
  users,
  issueTypes,
  issues,
  projectFields,
  projectMembers,
  projects,
  revisions,
  tags,
} from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import { listAllProjects, listTrashedProjects, listUsers } from "@/server/queries/admin";
import {
  generateTemporaryPassword,
  generateTemporaryPasswordText,
  purgeProject,
  removeUser,
  restoreProject,
  transferOwnership,
} from "./admin";
import { signIn, signUp, validateSession } from "./auth";
import { ForbiddenError, ValidationError } from "./errors";
import { inviteMember, respondToInvitation } from "./members";
import { createProject, deleteProject } from "./projects";

const db = getTestDb();

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => expect.fail("expected the call to fail"),
    (e: unknown) => e,
  );
}

const projectInput = (code: string) => ({
  clientName: `Client ${code}`,
  code,
  description: "",
  fieldStartDate: "2026-10-01",
  timezone: "UTC",
  dateFormat: "YYYY/MM/DD",
});

async function admin() {
  return actorOf(await createUser(db, { isAdmin: true }));
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("admin actions are for admins only (SPEC §5.3)", () => {
  it("refuses everyone else", async () => {
    const user = actorOf(await createUser(db));
    const other = await createUser(db);

    const project = await createProject(user, projectInput("NA-1"), { db });

    await expect(generateTemporaryPassword(user, other.id, { db })).rejects.toThrow(ForbiddenError);
    await expect(
      transferOwnership(user, { projectId: project.id, userId: other.id }, { db }),
    ).rejects.toThrow(ForbiddenError);
    await deleteProject(user, project.id, { confirmCode: "NA-1" }, { db });
    await expect(restoreProject(user, project.id, {}, { db })).rejects.toThrow(ForbiddenError);
    await expect(purgeProject(user, project.id, { confirmCode: "NA-1" }, { db })).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("generateTemporaryPassword (REQ-AUTH-07)", () => {
  it("creates readable passwords", () => {
    const password = generateTemporaryPasswordText();
    expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{12}$/);
    expect(generateTemporaryPasswordText()).not.toBe(password);
  });

  it("replaces the password, forces a change and ends the user's sessions", async () => {
    const boss = await admin();
    const user = await createUser(db, { password: "old-secret" });
    const { token } = await signIn({ email: user.email, password: "old-secret" }, { db });

    const { password } = await generateTemporaryPassword(boss, user.id, { db });

    expect(await validateSession(token, { db })).toBeNull();
    const session = await signIn({ email: user.email, password }, { db });
    expect(session.user.mustChangePassword).toBe(true);
    await expect(signIn({ email: user.email, password: "old-secret" }, { db })).rejects.toThrow();

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "admin.temp_password"));
    expect(JSON.stringify(entry)).not.toContain(password);
  });

  it("is not for the admin's own account", async () => {
    const boss = await admin();
    await expect(generateTemporaryPassword(boss, boss.userId, { db })).rejects.toThrow(
      ValidationError,
    );
  });
});

describe("transferOwnership (REQ-PROJ-05)", () => {
  it("makes the new owner owner and the old owner member", async () => {
    const boss = await admin();
    const oldOwner = actorOf(await createUser(db));
    const newOwner = await createUser(db);
    const project = await createProject(oldOwner, projectInput("T-1"), { db });

    await transferOwnership(boss, { projectId: project.id, userId: newOwner.id }, { db });

    const members = await db
      .select({ userId: projectMembers.userId, role: projectMembers.role })
      .from(projectMembers);
    expect(members).toEqual(
      expect.arrayContaining([
        { userId: oldOwner.userId, role: "member" },
        { userId: newOwner.id, role: "owner" },
      ]),
    );
    expect(members.filter((m) => m.role === "owner")).toHaveLength(1);
    const [listed] = await listAllProjects({ db });
    expect(listed).toMatchObject({ ownerId: newOwner.id, memberCount: 2 });
  });

  it("promotes an existing viewer", async () => {
    const boss = await admin();
    const owner = actorOf(await createUser(db));
    const viewer = await createUser(db);
    const project = await createProject(owner, projectInput("T-2"), { db });
    await addMember(db, project.id, viewer.id, "viewer");

    await transferOwnership(boss, { projectId: project.id, userId: viewer.id }, { db });

    const [row] = await db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.userId, viewer.id));
    expect(row.role).toBe("owner");
  });

  it("refuses the current owner and projects in the trash", async () => {
    const boss = await admin();
    const owner = actorOf(await createUser(db));
    const other = await createUser(db);
    const project = await createProject(owner, projectInput("T-3"), { db });

    await expect(
      transferOwnership(boss, { projectId: project.id, userId: owner.userId }, { db }),
    ).rejects.toThrow("This user already owns the project.");

    await deleteProject(owner, project.id, { confirmCode: "T-3" }, { db });
    await expect(
      transferOwnership(boss, { projectId: project.id, userId: other.id }, { db }),
    ).rejects.toThrow("Project not found.");
  });
});

describe("trash (REQ-PROJ-04)", () => {
  async function trashed(code: string) {
    const owner = actorOf(await createUser(db));
    const project = await createProject(owner, projectInput(code), { db });
    await deleteProject(owner, project.id, { confirmCode: code }, { db });
    return { owner, project };
  }

  it("lists and restores a deleted project", async () => {
    const boss = await admin();
    const { project } = await trashed("TR-1");
    expect(await listTrashedProjects({ db })).toEqual([
      expect.objectContaining({ id: project.id, code: "TR-1", memberCount: 1 }),
    ]);

    await restoreProject(boss, project.id, {}, { db });

    const [row] = await db.select().from(projects);
    expect(row.deletedAt).toBeNull();
    expect(await listTrashedProjects({ db })).toEqual([]);
  });

  it("refuses to restore when an active project took the code", async () => {
    const boss = await admin();
    const { owner, project } = await trashed("TR-2");
    await createProject(owner, projectInput("tr-2"), { db });

    const error = await rejection(restoreProject(boss, project.id, {}, { db }));

    expect((error as Error).message).toContain("Another active project uses the code TR-2");
  });

  it("purges everything of the project and nothing else", async () => {
    const boss = await admin();
    const owner = actorOf(await createUser(db));
    const keep = await createProject(owner, projectInput("KEEP"), { db });
    const gone = await createProject(owner, projectInput("GONE"), { db });
    await createTag(db, keep.id);
    const tag = await createTag(db, gone.id);
    const [type] = await db.select().from(issueTypes).where(eq(issueTypes.projectId, gone.id));
    await db.insert(issues).values({
      projectId: gone.id,
      tagId: tag.id,
      issueTypeId: type.id,
      description: "Loose wire",
      openedBy: owner.userId,
      updatedBy: owner.userId,
    });
    const [rev] = await db
      .insert(revisions)
      .values({
        projectId: gone.id,
        name: "Rev A",
        kind: "initial_import",
        createdBy: owner.userId,
      })
      .returning();
    await db.update(projects).set({ currentRevisionId: rev.id }).where(eq(projects.id, gone.id));
    await inviteMember(owner, gone.id, { email: "x@example.com", role: "viewer" }, { db });
    await deleteProject(owner, gone.id, { confirmCode: "GONE" }, { db });

    const wrong = await rejection(purgeProject(boss, gone.id, { confirmCode: "gone" }, { db }));
    expect((wrong as ValidationError).fieldErrors.confirmCode).toBeDefined();

    await purgeProject(boss, gone.id, { confirmCode: "GONE" }, { db });

    const remaining = async (table: typeof tags | typeof projectFields | typeof invitations) =>
      (await db.select({ projectId: table.projectId }).from(table)).map((r) => r.projectId);
    expect((await db.select().from(projects)).map((p) => p.code)).toEqual(["KEEP"]);
    expect(new Set(await remaining(tags))).toEqual(new Set([keep.id]));
    expect(new Set(await remaining(projectFields))).toEqual(new Set([keep.id]));
    expect(await remaining(invitations)).toEqual([]);
    expect(await db.select().from(issues)).toEqual([]);

    const log = await db.select().from(auditLog);
    expect(log.some((e) => e.projectId === gone.id)).toBe(false);
    expect(log.some((e) => e.projectId === keep.id)).toBe(true);
    expect(log.find((e) => e.action === "admin.purge")).toMatchObject({
      actorId: boss.userId,
      projectId: null,
      entityId: gone.id,
      before: { code: "GONE" },
    });
  });

  it("purges only projects in the trash", async () => {
    const boss = await admin();
    const owner = actorOf(await createUser(db));
    const project = await createProject(owner, projectInput("LIVE"), { db });

    await expect(purgeProject(boss, project.id, { confirmCode: "LIVE" }, { db })).rejects.toThrow(
      "Project not found.",
    );
  });

  it("does not leave audit deletes allowed after a purge (SET LOCAL)", async () => {
    const boss = await admin();
    const { project } = await trashed("TR-3");
    await createProject(boss, projectInput("TR-4"), { db });

    await purgeProject(boss, project.id, { confirmCode: "TR-3" }, { db });

    // Same connection pool, new transaction: the trigger refuses again.
    await expect(db.execute(sql`DELETE FROM audit_log`)).rejects.toThrow();
    expect((await db.select().from(auditLog)).length).toBeGreaterThan(0);
  });
});

describe("listUsers", () => {
  it("counts projects outside the trash", async () => {
    const owner = actorOf(await createUser(db, { firstName: "Ana" }));
    await createProject(owner, projectInput("U-1"), { db });
    const gone = await createProject(owner, projectInput("U-2"), { db });
    await deleteProject(owner, gone.id, { confirmCode: "U-2" }, { db });

    const [ana] = await listUsers({ db });
    expect(ana.projectCount).toBe(1);
  });
});

describe("removeUser (deactivation)", () => {
  /** Ana owns an active project and a trashed one, joined Bob's, and has a pending invitation. */
  async function scenario() {
    const boss = await admin();
    const anaUser = await createUser(db, { email: "ana@example.com", password: "secret" });
    const ana = actorOf(anaUser);
    const bob = actorOf(await createUser(db));
    const heir = await createUser(db);
    const active = await createProject(ana, projectInput("RM-1"), { db });
    const trashed = await createProject(ana, projectInput("RM-2"), { db });
    await deleteProject(ana, trashed.id, { confirmCode: "RM-2" }, { db });
    const bobs = await createProject(bob, projectInput("RM-3"), { db });
    await addMember(db, bobs.id, ana.userId, "member");
    const other = await createProject(bob, projectInput("RM-4"), { db });
    await inviteMember(bob, other.id, { email: "ana@example.com", role: "viewer" }, { db });
    return { boss, ana, anaUser, bob, heir, active, trashed, bobs };
  }

  it("deactivates the account, hands active projects over and keeps the history", async () => {
    const { boss, ana, anaUser, heir, active, trashed, bobs } = await scenario();
    const { token } = await signIn({ email: "ana@example.com", password: "secret" }, { db });

    await removeUser(
      boss,
      ana.userId,
      { confirmEmail: "ANA@example.com", newOwners: { [active.id]: heir.id } },
      { db },
    );

    // Cannot sign in, sessions ended, same message as an unknown account
    expect(await validateSession(token, { db })).toBeNull();
    await expect(signIn({ email: "ana@example.com", password: "secret" }, { db })).rejects.toThrow(
      "Invalid email or password.",
    );
    // Left every project; the active one has the new owner
    const memberships = await db.select().from(projectMembers);
    expect(memberships.some((m) => m.userId === ana.userId)).toBe(false);
    expect(memberships).toContainEqual(
      expect.objectContaining({ projectId: active.id, userId: heir.id, role: "owner" }),
    );
    expect(memberships.some((m) => m.projectId === bobs.id && m.userId === ana.userId)).toBe(false);
    // The trashed project stays in the trash, now without owner
    const [trash] = await listTrashedProjects({ db });
    expect(trash).toMatchObject({ id: trashed.id, hasOwner: false });
    // Pending invitations to the e-mail are cancelled
    const pending = await db.select().from(invitations).where(eq(invitations.status, "pending"));
    expect(pending).toEqual([]);
    // Nothing deleted: the account and its history remain
    const [row] = await db.select().from(users).where(eq(users.id, ana.userId));
    expect(row).toMatchObject({ deactivatedBy: boss.userId, firstName: anaUser.firstName });
    const log = await db.select().from(auditLog).where(eq(auditLog.actorId, ana.userId));
    expect(log.length).toBeGreaterThan(0);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "admin.remove_user"));
    expect(entry).toMatchObject({ actorId: boss.userId, entityId: ana.userId });
  });

  it("needs a new owner for every active project, and the current list", async () => {
    const { boss, ana, heir, active } = await scenario();

    await expect(
      removeUser(boss, ana.userId, { confirmEmail: "ana@example.com", newOwners: {} }, { db }),
    ).rejects.toThrow("This user's projects changed meanwhile.");
    const wrongEmail = await rejection(
      removeUser(
        boss,
        ana.userId,
        { confirmEmail: "bob@example.com", newOwners: { [active.id]: heir.id } },
        { db },
      ),
    );
    expect((wrongEmail as ValidationError).fieldErrors.confirmEmail).toBeDefined();
    const [row] = await db.select().from(users).where(eq(users.id, ana.userId));
    expect(row.deactivatedAt).toBeNull();
  });

  it("refuses admins, oneself and removed accounts as new owners", async () => {
    const { boss, ana, active } = await scenario();
    const otherAdmin = await admin();
    const removed = await createUser(db, { deactivatedAt: new Date() });

    await expect(
      removeUser(boss, otherAdmin.userId, { confirmEmail: "x", newOwners: {} }, { db }),
    ).rejects.toThrow("Administrators are managed by IT.");
    await expect(
      removeUser(boss, boss.userId, { confirmEmail: "x", newOwners: {} }, { db }),
    ).rejects.toThrow("You cannot remove your own account.");
    await expect(
      removeUser(
        boss,
        ana.userId,
        { confirmEmail: "ana@example.com", newOwners: { [active.id]: removed.id } },
        { db },
      ),
    ).rejects.toThrow("This account was removed.");
  });

  it("keeps the e-mail taken and the account out of invitations", async () => {
    const { boss, ana, bob, heir, active, bobs } = await scenario();
    await removeUser(
      boss,
      ana.userId,
      { confirmEmail: "ana@example.com", newOwners: { [active.id]: heir.id } },
      { db },
    );

    await expect(
      signUp(
        {
          firstName: "Ana",
          lastName: "Again",
          email: "ana@example.com",
          password: "x",
          confirmPassword: "x",
        },
        { db },
      ),
    ).rejects.toThrow(ValidationError);
    const invite = await rejection(
      inviteMember(bob, bobs.id, { email: "ana@example.com", role: "member" }, { db }),
    );
    expect((invite as ValidationError).fieldErrors.email).toEqual([
      "This account was removed by an administrator.",
    ]);
  });

  it("restoring an ownerless project requires a new owner", async () => {
    const { boss, ana, heir, active, trashed } = await scenario();
    await removeUser(
      boss,
      ana.userId,
      { confirmEmail: "ana@example.com", newOwners: { [active.id]: heir.id } },
      { db },
    );

    const missing = await rejection(restoreProject(boss, trashed.id, {}, { db }));
    expect((missing as ValidationError).fieldErrors.newOwnerId).toBeDefined();

    await restoreProject(boss, trashed.id, { newOwnerId: heir.id }, { db });
    const owners = await db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, trashed.id));
    expect(owners).toEqual([expect.objectContaining({ userId: heir.id, role: "owner" })]);
  });

  it("a removed user's pending answer is impossible: invitations were cancelled", async () => {
    const { boss, ana, heir, active } = await scenario();
    const [invitation] = await db.select().from(invitations);
    await removeUser(
      boss,
      ana.userId,
      { confirmEmail: "ana@example.com", newOwners: { [active.id]: heir.id } },
      { db },
    );

    await expect(respondToInvitation(ana, invitation.id, { accept: true }, { db })).rejects.toThrow(
      "This invitation is no longer pending.",
    );
  });
});
