import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addMember, createProject, createTag, createUser } from "@/server/db/fixtures";
import { ioListClears, projects, revisions } from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import { listMyProjects } from "./projects";

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
