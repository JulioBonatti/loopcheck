import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { ProjectRole } from "@/lib/permissions";
import { auditLog, projectMembers, projects, tags, users } from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { mutate } from "./mutation";
import { type Actor, requireProjectPermission } from "./permissions";
import { updateVersioned } from "./versioning";

const db = getTestDb();

let n = 0;
async function createActor(isAdmin = false): Promise<Actor> {
  n += 1;
  const [user] = await db
    .insert(users)
    .values({
      email: `user${n}@example.com`,
      firstName: "User",
      lastName: `${n}`,
      passwordHash: "x",
      isAdmin,
    })
    .returning();
  return { userId: user.id, isAdmin };
}

async function createProject(owner: Actor) {
  const [project] = await db
    .insert(projects)
    .values({
      clientName: "ACME",
      code: "P-001",
      fieldStartDate: "2026-10-01",
      timezone: "America/Chicago",
      createdBy: owner.userId,
    })
    .returning();
  await addMember(project.id, owner, "owner");
  return project;
}

async function addMember(projectId: string, actor: Actor, role: ProjectRole) {
  await db.insert(projectMembers).values({ projectId, userId: actor.userId, role });
}

async function createTag(projectId: string, tag = "PT-6824") {
  const [row] = await db
    .insert(tags)
    .values({ projectId, tag, description: "Pressure transmitter", ioType: "AI" })
    .returning();
  return row;
}

/** A minimal service built on `mutate`: renames a tag's description. */
function editDescription(actor: Actor, projectId: string, input: unknown) {
  return mutate({
    db,
    actor,
    authorize: (tx) => requireProjectPermission(tx, actor, projectId, "iolist.edit"),
    schema: z.object({ tagId: z.uuid(), version: z.int(), description: z.string().trim().min(1) }),
    input,
    run: async ({ tx, audit }, data) => {
      const { before, after } = await updateVersioned(tx, {
        entity: "tag",
        id: data.tagId,
        projectId,
        expectedVersion: data.version,
        changes: { description: data.description },
      });
      audit({ action: "iolist.edit", entityType: "tag", entityId: after.id, projectId, before, after });
      return after;
    },
  });
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => expect.fail("expected the call to fail"),
    (e: unknown) => e,
  );
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("mutate (ARQ-01)", () => {
  it("applies the change and its audit entry together", async () => {
    const owner = await createActor();
    const project = await createProject(owner);
    const tag = await createTag(project.id);

    const after = await editDescription(owner, project.id, {
      tagId: tag.id,
      version: 1,
      description: "  Flow transmitter ",
    });

    expect(after).toMatchObject({ description: "Flow transmitter", version: 2 });
    const log = await db.select().from(auditLog);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actorId: owner.userId,
      projectId: project.id,
      entityType: "tag",
      entityId: tag.id,
      action: "iolist.edit",
      before: { description: "Pressure transmitter" },
      after: { description: "Flow transmitter" },
    });
  });

  it("refuses with 403 before validating, and writes nothing (REQ-PERM-01)", async () => {
    const owner = await createActor();
    const viewer = await createActor();
    const project = await createProject(owner);
    await addMember(project.id, viewer, "viewer");

    const error = await rejection(editDescription(viewer, project.id, { invalid: true }));

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("rejects invalid input and writes nothing", async () => {
    const owner = await createActor();
    const project = await createProject(owner);
    const tag = await createTag(project.id);

    const error = await rejection(
      editDescription(owner, project.id, { tagId: tag.id, version: 1, description: "   " }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors.description).toBeDefined();
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("rolls back the change when the action fails midway", async () => {
    const owner = await createActor();
    const project = await createProject(owner);

    const error = await rejection(
      mutate({
        db,
        actor: owner,
        authorize: (tx) => requireProjectPermission(tx, owner, project.id, "iolist.edit"),
        schema: z.object({}),
        input: {},
        run: async ({ tx, audit }) => {
          const [tag] = await tx
            .insert(tags)
            .values({ projectId: project.id, tag: "PT-1", description: "x", ioType: "AI" })
            .returning();
          audit({ action: "iolist.edit", entityType: "tag", entityId: tag.id, after: tag });
          throw new Error("boom");
        },
      }),
    );

    expect((error as Error).message).toBe("boom");
    expect(await db.select().from(tags)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("refuses a mutation that records no audit entry", async () => {
    const owner = await createActor();
    const project = await createProject(owner);
    const tag = await createTag(project.id);

    await rejection(
      mutate({
        db,
        actor: owner,
        authorize: () => undefined,
        schema: z.object({}),
        input: {},
        run: ({ tx }) => tx.update(tags).set({ description: "changed" }).where(eq(tags.id, tag.id)),
      }),
    );

    const [row] = await db.select().from(tags);
    expect(row.description).toBe("Pressure transmitter");
  });
});

describe("requireProjectPermission", () => {
  it("returns the actor's role", async () => {
    const owner = await createActor();
    const member = await createActor();
    const project = await createProject(owner);
    await addMember(project.id, member, "member");

    expect(await requireProjectPermission(db, member, project.id, "tag.checkout")).toEqual({
      projectId: project.id,
      role: "member",
    });
  });

  it("refuses non-members, including admins (REQ-PERM-03)", async () => {
    const owner = await createActor();
    const admin = await createActor(true);
    const project = await createProject(owner);

    await expect(requireProjectPermission(db, admin, project.id, "project.view")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("hides projects in the trash and unknown ids", async () => {
    const owner = await createActor();
    const project = await createProject(owner);
    await db
      .update(projects)
      .set({ deletedAt: new Date(), deletedBy: owner.userId })
      .where(eq(projects.id, project.id));

    await expect(requireProjectPermission(db, owner, project.id, "project.view")).rejects.toThrow(
      NotFoundError,
    );
    await expect(requireProjectPermission(db, owner, "not-a-uuid", "project.view")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("updateVersioned (ARQ-04, REQ-RT-04)", () => {
  it("refuses a stale version and says who changed the tag", async () => {
    const owner = await createActor();
    const project = await createProject(owner);
    const tag = await createTag(project.id);
    await editDescription(owner, project.id, { tagId: tag.id, version: 1, description: "First" });

    const error = await rejection(
      editDescription(owner, project.id, { tagId: tag.id, version: 1, description: "Second" }),
    );

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).info.changedBy).toBe(`User ${n}`);
    const [row] = await db.select().from(tags);
    expect(row).toMatchObject({ description: "First", version: 2 });
  });

  it("lets only one of two simultaneous edits win", async () => {
    const owner = await createActor();
    const member = await createActor();
    const project = await createProject(owner);
    await addMember(project.id, member, "member");
    const tag = await createTag(project.id);

    const results = await Promise.allSettled([
      editDescription(owner, project.id, { tagId: tag.id, version: 1, description: "Owner" }),
      editDescription(member, project.id, { tagId: tag.id, version: 1, description: "Member" }),
    ]);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it("does not reach tags of another project", async () => {
    const owner = await createActor();
    const project = await createProject(owner);
    const other = await createProject(await createActor());
    const foreignTag = await createTag(other.id);

    const error = await rejection(
      editDescription(owner, project.id, { tagId: foreignTag.id, version: 1, description: "Hijack" }),
    );

    expect(error).toBeInstanceOf(NotFoundError);
    const [row] = await db.select().from(tags).where(eq(tags.id, foreignTag.id));
    expect(row.description).toBe("Pressure transmitter");
  });
});
