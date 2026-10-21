import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { actorOf, addMember, createProject, createUser } from "@/server/db/fixtures";
import { auditLog, invitations, projectMembers, projects } from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import {
  countMyInvitations,
  listMyInvitations,
  listProjectInvitations,
  listProjectMembers,
} from "@/server/queries/members";
import { listMyProjects } from "@/server/queries/projects";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import {
  cancelInvitation,
  changeMemberRole,
  inviteMember,
  leaveProject,
  removeMember,
  respondToInvitation,
} from "./members";

const db = getTestDb();

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("leaveProject (REQ-ACC-01)", () => {
  it("removes a member and audits it", async () => {
    const owner = await createUser(db);
    const member = await createUser(db);
    const project = await createProject(db, owner.id);
    await addMember(db, project.id, member.id, "viewer");

    await leaveProject(actorOf(member), project.id, { db });

    const rows = await db.select().from(projectMembers);
    expect(rows.map((r) => r.userId)).toEqual([owner.id]);
    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({
      action: "member.leave",
      actorId: member.id,
      projectId: project.id,
      before: { role: "viewer" },
      after: null,
    });
  });

  it("refuses the owner (SPEC §5.3)", async () => {
    const owner = await createUser(db);
    const project = await createProject(db, owner.id);

    await expect(leaveProject(actorOf(owner), project.id, { db })).rejects.toThrow(ForbiddenError);
    expect(await db.select().from(projectMembers)).toHaveLength(1);
  });

  it("refuses someone who is not a member", async () => {
    const owner = await createUser(db);
    const stranger = await createUser(db);
    const project = await createProject(db, owner.id);

    await expect(leaveProject(actorOf(stranger), project.id, { db })).rejects.toThrow(
      ForbiddenError,
    );
  });
});

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => expect.fail("expected the call to fail"),
    (e: unknown) => e,
  );
}

/** An owner with a project, plus a second account (not a member yet). */
async function setup() {
  const ownerUser = await createUser(db, { firstName: "Olga", lastName: "Owner" });
  const guestUser = await createUser(db, { email: "guest@example.com" });
  const project = await createProject(db, ownerUser.id);
  return { owner: actorOf(ownerUser), guest: actorOf(guestUser), project };
}

describe("inviteMember (REQ-MEM-01)", () => {
  it("creates a pending invitation, shown to that e-mail (REQ-ACC-02, REQ-MEM-05)", async () => {
    const { owner, project } = await setup();

    await inviteMember(owner, project.id, { email: " Guest@Example.com ", role: "viewer" }, { db });

    expect(await listProjectInvitations(project.id, { db })).toEqual([
      expect.objectContaining({
        email: "guest@example.com",
        role: "viewer",
        invitedBy: "Olga Owner",
      }),
    ]);
    expect(await listMyInvitations("guest@example.com", { db })).toEqual([
      expect.objectContaining({ projectId: project.id, code: project.code, role: "viewer" }),
    ]);
    expect(await countMyInvitations("guest@example.com", { db })).toBe(1);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "member.invite"));
    expect(entry).toMatchObject({ actorId: owner.userId, projectId: project.id });
  });

  it("works for e-mails without an account yet (REQ-MEM-03)", async () => {
    const { owner, project } = await setup();

    await inviteMember(owner, project.id, { email: "new@example.com", role: "member" }, { db });
    const newcomer = await createUser(db, { email: "new@example.com" });

    expect(await countMyInvitations(newcomer.email, { db })).toBe(1);
  });

  it("refuses members, duplicates, owner roles and non-owners", async () => {
    const { owner, guest, project } = await setup();
    await addMember(db, project.id, guest.userId, "member");

    const member = await rejection(
      inviteMember(owner, project.id, { email: "guest@example.com", role: "viewer" }, { db }),
    );
    expect((member as ValidationError).fieldErrors.email).toEqual([
      "This person is already a member.",
    ]);

    await inviteMember(owner, project.id, { email: "x@example.com", role: "viewer" }, { db });
    const duplicate = await rejection(
      inviteMember(owner, project.id, { email: "x@example.com", role: "member" }, { db }),
    );
    expect((duplicate as ValidationError).fieldErrors.email).toEqual([
      "This email already has a pending invitation.",
    ]);

    const asOwner = await rejection(
      inviteMember(owner, project.id, { email: "y@example.com", role: "owner" }, { db }),
    );
    expect((asOwner as ValidationError).fieldErrors.role).toBeDefined();

    await expect(
      inviteMember(guest, project.id, { email: "z@example.com", role: "viewer" }, { db }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("respondToInvitation (REQ-MEM-02)", () => {
  async function invited(role: "member" | "viewer" = "member") {
    const ctx = await setup();
    const invitation = await inviteMember(
      ctx.owner,
      ctx.project.id,
      { email: "guest@example.com", role },
      { db },
    );
    return { ...ctx, invitation };
  }

  it("accepting makes the user a member with the invitation's role", async () => {
    const { guest, project, invitation } = await invited("viewer");

    await respondToInvitation(guest, invitation.id, { accept: true }, { db });

    expect(await listMyProjects(guest.userId, { db })).toEqual([
      expect.objectContaining({ id: project.id, role: "viewer" }),
    ]);
    expect(await countMyInvitations("guest@example.com", { db })).toBe(0);
    const [row] = await db.select().from(invitations);
    expect(row.status).toBe("accepted");
    expect(row.respondedAt).toBeInstanceOf(Date);
  });

  it("declining leaves no membership", async () => {
    const { guest, invitation } = await invited();

    await respondToInvitation(guest, invitation.id, { accept: false }, { db });

    expect(await listMyProjects(guest.userId, { db })).toEqual([]);
    const actions = (await db.select().from(auditLog)).map((e) => e.action);
    expect(actions).toContain("member.decline");
  });

  it("only the invited e-mail can answer, and reveals nothing to others", async () => {
    const { owner, invitation } = await invited();

    await expect(
      respondToInvitation(owner, invitation.id, { accept: true }, { db }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses cancelled invitations and projects in the trash", async () => {
    const { owner, guest, project, invitation } = await invited();
    await cancelInvitation(owner, project.id, invitation.id, { db });

    const cancelled = await rejection(
      respondToInvitation(guest, invitation.id, { accept: true }, { db }),
    );
    expect((cancelled as Error).message).toBe("This invitation is no longer pending.");

    const again = await inviteMember(
      owner,
      project.id,
      { email: "guest@example.com", role: "member" },
      { db },
    );
    await db
      .update(projects)
      .set({ deletedAt: new Date(), deletedBy: owner.userId })
      .where(eq(projects.id, project.id));
    expect(await countMyInvitations("guest@example.com", { db })).toBe(0);
    await expect(respondToInvitation(guest, again.id, { accept: true }, { db })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lets only one of accept and cancel win when they race", async () => {
    const { owner, guest, project, invitation } = await invited();

    const results = await Promise.allSettled([
      respondToInvitation(guest, invitation.id, { accept: true }, { db }),
      cancelInvitation(owner, project.id, invitation.id, { db }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [row] = await db.select().from(invitations);
    const isMember = (await listMyProjects(guest.userId, { db })).length === 1;
    expect(isMember).toBe(row.status === "accepted");
  });
});

describe("changeMemberRole and removeMember (REQ-MEM-04)", () => {
  it("the owner switches a member between member and viewer", async () => {
    const { owner, guest, project } = await setup();
    await addMember(db, project.id, guest.userId, "member");

    await changeMemberRole(owner, project.id, { userId: guest.userId, role: "viewer" }, { db });

    const members = await listProjectMembers(project.id, { db });
    expect(members.map((m) => m.role)).toEqual(["owner", "viewer"]);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "member.role_change"));
    expect(entry).toMatchObject({ before: { role: "member" }, after: { role: "viewer" } });
  });

  it("never touches the owner's own membership", async () => {
    const { owner, project } = await setup();

    await expect(
      changeMemberRole(owner, project.id, { userId: owner.userId, role: "viewer" }, { db }),
    ).rejects.toThrow(ForbiddenError);
    await expect(removeMember(owner, project.id, owner.userId, { db })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("removes a member, who can be invited again", async () => {
    const { owner, guest, project } = await setup();
    await addMember(db, project.id, guest.userId, "member");

    await removeMember(owner, project.id, guest.userId, { db });

    expect(await listMyProjects(guest.userId, { db })).toEqual([]);
    await expect(
      inviteMember(owner, project.id, { email: "guest@example.com", role: "member" }, { db }),
    ).resolves.toBeDefined();
  });

  it("is for the owner only", async () => {
    const { guest, project } = await setup();
    const other = actorOf(await createUser(db));
    await addMember(db, project.id, guest.userId, "member");
    await addMember(db, project.id, other.userId, "member");

    await expect(
      changeMemberRole(guest, project.id, { userId: other.userId, role: "viewer" }, { db }),
    ).rejects.toThrow(ForbiddenError);
    await expect(removeMember(guest, project.id, other.userId, { db })).rejects.toThrow(
      ForbiddenError,
    );
  });
});
