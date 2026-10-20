import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { actorOf, addMember, createUser } from "@/server/db/fixtures";
import {
  auditLog,
  issueTypes,
  projectFields,
  projectMembers,
  projects,
  testProcedures,
} from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import { getProjectForUser, listMyProjects } from "@/server/queries/projects";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { createProject, deleteProject, updateProject } from "./projects";

const db = getTestDb();

const acme = {
  clientName: "ACME Mining",
  code: "P-001",
  description: "",
  fieldStartDate: "2026-10-01",
  timezone: "America/Chicago",
  dateFormat: "MM/DD/YYYY",
};

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => expect.fail("expected the call to fail"),
    (e: unknown) => e,
  );
}

async function ownerWithProject(values = acme) {
  const owner = actorOf(await createUser(db));
  const project = await createProject(owner, values, { db });
  return { owner, project };
}

async function memberOf(projectId: string, role: "member" | "viewer") {
  const user = await createUser(db);
  await addMember(db, projectId, user.id, role);
  return actorOf(user);
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("createProject (REQ-PROJ-01, REQ-PROJ-02)", () => {
  it("makes the creator owner and adds the default columns and issue types", async () => {
    const { owner, project } = await ownerWithProject();

    expect(project).toMatchObject({ ...acme, description: null, createdBy: owner.userId });
    expect(await db.select().from(projectMembers)).toEqual([
      expect.objectContaining({ userId: owner.userId, role: "owner" }),
    ]);

    const fields = await db
      .select()
      .from(projectFields)
      .where(eq(projectFields.projectId, project.id))
      .orderBy(projectFields.sortOrder);
    expect(fields.map((f) => f.key)).toEqual([
      "tag",
      "description",
      "io_type",
      "loop",
      "pid",
      "range_min",
      "range_max",
      "unit",
    ]);
    expect(fields.filter((f) => f.required).map((f) => f.key)).toEqual([
      "tag",
      "description",
      "io_type",
    ]);
    expect(fields.filter((f) => f.testRelevant).map((f) => f.key)).toEqual([
      "io_type",
      "range_min",
      "range_max",
      "unit",
    ]);
    expect(fields.every((f) => f.source === "builtin")).toBe(true);

    const types = await db.select().from(issueTypes).orderBy(issueTypes.sortOrder);
    expect(types.map((t) => t.name)).toEqual(["Field", "Wiring", "Logic", "Other"]);
    expect(await db.select().from(testProcedures)).toHaveLength(0);
  });

  it("is audited", async () => {
    const { owner, project } = await ownerWithProject();

    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({
      action: "project.create",
      actorId: owner.userId,
      projectId: project.id,
      after: expect.objectContaining({ code: "P-001", timezone: "America/Chicago" }),
    });
  });

  it("validates the input", async () => {
    const owner = actorOf(await createUser(db));

    const error = await rejection(
      createProject(
        owner,
        { ...acme, clientName: " ", code: "", fieldStartDate: "2026-02-30", timezone: "Mars/Base" },
        { db },
      ),
    );

    expect(Object.keys((error as ValidationError).fieldErrors).sort()).toEqual([
      "clientName",
      "code",
      "fieldStartDate",
      "timezone",
    ]);
    expect(await db.select().from(projects)).toHaveLength(0);
  });

  it("refuses a code already used outside the trash, in any case", async () => {
    const { owner, project } = await ownerWithProject();

    const error = await rejection(createProject(owner, { ...acme, code: " p-001 " }, { db }));
    expect((error as ValidationError).fieldErrors.code).toEqual([
      "A project with this code already exists.",
    ]);

    await deleteProject(owner, project.id, { confirmCode: "P-001" }, { db });
    await expect(createProject(owner, acme, { db })).resolves.toBeDefined();
  });
});

describe("updateProject (REQ-SET-01)", () => {
  it("lets a member edit and audits only what changed", async () => {
    const { project } = await ownerWithProject();
    const member = await memberOf(project.id, "member");

    await updateProject(member, project.id, { ...acme, timezone: "America/Sao_Paulo" }, { db });

    const [row] = await db.select().from(projects);
    expect(row.timezone).toBe("America/Sao_Paulo");
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "project.update"));
    expect(entry).toMatchObject({
      actorId: member.userId,
      before: { timezone: "America/Chicago" },
      after: { timezone: "America/Sao_Paulo" },
    });
  });

  it("refuses viewers (REQ-PERM-01)", async () => {
    const { project } = await ownerWithProject();
    const viewer = await memberOf(project.id, "viewer");

    await expect(
      updateProject(viewer, project.id, { ...acme, clientName: "Hacked" }, { db }),
    ).rejects.toThrow(ForbiddenError);
    const [row] = await db.select().from(projects);
    expect(row.clientName).toBe("ACME Mining");
  });

  it("refuses a code taken by another project", async () => {
    const { owner } = await ownerWithProject();
    const other = await createProject(owner, { ...acme, code: "P-002" }, { db });

    const error = await rejection(updateProject(owner, other.id, acme, { db }));

    expect((error as ValidationError).fieldErrors.code).toBeDefined();
  });
});

describe("deleteProject (REQ-PROJ-03)", () => {
  it("moves the project to the trash, out of every member's reach", async () => {
    const { owner, project } = await ownerWithProject();
    const member = await memberOf(project.id, "member");

    await deleteProject(owner, project.id, { confirmCode: "P-001" }, { db });

    const [row] = await db.select().from(projects);
    expect(row).toMatchObject({ deletedBy: owner.userId });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(await listMyProjects(member.userId, { db })).toEqual([]);
    expect(await getProjectForUser(member.userId, project.id, { db })).toBeNull();
    await expect(updateProject(owner, project.id, acme, { db })).rejects.toThrow(NotFoundError);
    const actions = (await db.select().from(auditLog)).map((e) => e.action);
    expect(actions).toContain("project.delete");
  });

  it("requires the exact project code", async () => {
    const { owner, project } = await ownerWithProject();

    const error = await rejection(
      deleteProject(owner, project.id, { confirmCode: "p-001" }, { db }),
    );

    expect((error as ValidationError).fieldErrors.confirmCode).toBeDefined();
    const [row] = await db.select().from(projects);
    expect(row.deletedAt).toBeNull();
  });

  it("is for the owner only", async () => {
    const { project } = await ownerWithProject();
    const member = await memberOf(project.id, "member");

    await expect(
      deleteProject(member, project.id, { confirmCode: "P-001" }, { db }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("getProjectForUser", () => {
  it("returns the project with the user's role, or null for non-members and bad ids", async () => {
    const { owner, project } = await ownerWithProject();
    const stranger = actorOf(await createUser(db));

    expect(await getProjectForUser(owner.userId, project.id, { db })).toMatchObject({
      code: "P-001",
      role: "owner",
      dateFormat: "MM/DD/YYYY",
    });
    expect(await getProjectForUser(stranger.userId, project.id, { db })).toBeNull();
    expect(await getProjectForUser(owner.userId, "not-a-uuid", { db })).toBeNull();
  });
});
