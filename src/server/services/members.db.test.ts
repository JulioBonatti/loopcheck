import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { actorOf, addMember, createProject, createUser } from "@/server/db/fixtures";
import { auditLog, projectMembers } from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import { ForbiddenError } from "./errors";
import { leaveProject } from "./members";

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
