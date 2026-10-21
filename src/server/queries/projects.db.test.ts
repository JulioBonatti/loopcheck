import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { actorOf, addMember, createProject, createTag, createUser } from "@/server/db/fixtures";
import { auditLog, ioListClears, projects, revisions } from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import { createProject as createProjectService } from "@/server/services/projects";
import { leaveProject } from "@/server/services/members";
import { getRecentProject, listMyProjects } from "./projects";

const db = getTestDb();

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("listMyProjects (REQ-UI-02)", () => {
  it("lists only the user's projects outside the trash, with the role", async () => {
    const ana = await createUser(db);
    const bob = await createUser(db);
    const mine = await createProject(db, ana.id, { clientName: "Beta" });
    const joined = await createProject(db, bob.id, { clientName: "Alpha" });
    await addMember(db, joined.id, ana.id, "viewer");
    await createProject(db, bob.id, { clientName: "Not mine" });
    const trashed = await createProject(db, ana.id, { clientName: "Trashed" });
    await db
      .update(projects)
      .set({ deletedAt: new Date(), deletedBy: ana.id })
      .where(eq(projects.id, trashed.id));

    const list = await listMyProjects(ana.id, { db });

    expect(list.map((p) => [p.clientName, p.role])).toEqual([
      ["Alpha", "viewer"],
      ["Beta", "owner"],
    ]);
    expect(list.find((p) => p.id === mine.id)?.revisionName).toBeNull();
  });

  it("counts only countable tags for % OK (rule 7)", async () => {
    const ana = await createUser(db);
    const project = await createProject(db, ana.id);
    await createTag(db, project.id, { checkout: true });
    await createTag(db, project.id, { checkout: true });
    await createTag(db, project.id);
    // Not countable: out of scope, removed from the list, cleared
    await createTag(db, project.id, { checkout: true, inScope: false });
    await createTag(db, project.id, { checkout: true, listStatus: "removed" });
    const [clear] = await db
      .insert(ioListClears)
      .values({ projectId: project.id, clearedBy: ana.id })
      .returning();
    await createTag(db, project.id, { checkout: true, clearedInId: clear.id });

    const [summary] = await listMyProjects(ana.id, { db });

    expect(summary).toMatchObject({ countableTags: 3, checkedOutTags: 2 });
  });

  it("shows the current revision name", async () => {
    const ana = await createUser(db);
    const project = await createProject(db, ana.id);
    const [rev] = await db
      .insert(revisions)
      .values({ projectId: project.id, name: "Rev A", kind: "initial_import", createdBy: ana.id })
      .returning();
    await db.update(projects).set({ currentRevisionId: rev.id }).where(eq(projects.id, project.id));

    const [summary] = await listMyProjects(ana.id, { db });

    expect(summary.revisionName).toBe("Rev A");
  });
});

describe("getRecentProject (Recent in the menu)", () => {
  const input = (code: string) => ({
    clientName: `Client ${code}`,
    code,
    description: "",
    fieldStartDate: "2026-10-01",
    timezone: "UTC",
    dateFormat: "YYYY/MM/DD",
  });

  it("is the project of the user's latest change, not other people's", async () => {
    const ana = actorOf(await createUser(db));
    const bob = actorOf(await createUser(db));
    const first = await createProjectService(ana, input("R-1"), { db });
    const second = await createProjectService(ana, input("R-2"), { db });
    await addMember(db, first.id, bob.userId, "member");
    // Bob's later change in R-1 does not move Ana's "Recent"
    await db.insert(auditLog).values({
      actorId: bob.userId,
      projectId: first.id,
      entityType: "tag",
      entityId: "x",
      action: "tag.checkout",
    });

    expect(await getRecentProject(ana.userId, { db })).toMatchObject({
      id: second.id,
      code: "R-2",
    });
    expect(await getRecentProject(bob.userId, { db })).toMatchObject({ id: first.id });
  });

  it("skips projects in the trash and projects the user left", async () => {
    const ana = actorOf(await createUser(db));
    const bob = actorOf(await createUser(db));
    const kept = await createProjectService(bob, input("R-3"), { db });
    const left = await createProjectService(bob, input("R-4"), { db });
    await addMember(db, kept.id, ana.userId, "member");
    await addMember(db, left.id, ana.userId, "member");
    const anaProject = await createProjectService(ana, input("R-5"), { db });
    await db
      .update(projects)
      .set({ deletedAt: new Date(), deletedBy: ana.userId })
      .where(eq(projects.id, anaProject.id));
    await db.insert(auditLog).values({
      actorId: ana.userId,
      projectId: kept.id,
      entityType: "tag",
      entityId: "x",
      action: "tag.checkout",
    });
    await leaveProject(ana, left.id, { db });

    expect(await getRecentProject(ana.userId, { db })).toMatchObject({ id: kept.id });
  });

  it("is null before any change", async () => {
    const ana = await createUser(db);
    expect(await getRecentProject(ana.id, { db })).toBeNull();
  });
});
