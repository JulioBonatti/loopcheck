import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  invitations,
  ioListClears,
  issues,
  issueTypes,
  projectMembers,
  projects,
  tags,
  users,
} from "./schema";
import { getTestDb, pgErrorCode, truncateAll } from "./testing";

const db = getTestDb();

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const INSUFFICIENT_PRIVILEGE = "42501";

async function expectPgError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, "expected the query to fail").toBeDefined();
  expect(pgErrorCode(error)).toBe(code);
}

let n = 0;
async function createUser() {
  n += 1;
  const [user] = await db
    .insert(users)
    .values({
      email: `user${n}@example.com`,
      firstName: "Test",
      lastName: `User ${n}`,
      passwordHash: "not-a-real-hash",
    })
    .returning();
  return user;
}

async function createProject(createdBy: string) {
  const [project] = await db
    .insert(projects)
    .values({
      clientName: "ACME",
      code: "P-001",
      fieldStartDate: "2026-10-01",
      timezone: "America/Chicago",
      createdBy,
    })
    .returning();
  return project;
}

function tagValues(projectId: string, tag: string) {
  return { projectId, tag, description: "Pressure transmitter", ioType: "AI" };
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("schema defaults", () => {
  it("applies the defaults from SPEC §4", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    const [tag] = await db.insert(tags).values(tagValues(project.id, "PT-6824")).returning();

    expect(user.isAdmin).toBe(false);
    expect(project.dateFormat).toBe("YYYY/MM/DD");
    expect(tag).toMatchObject({
      attributes: {},
      inScope: true,
      listStatus: "active",
      checkout: false,
      retestAlert: false,
      version: 1,
    });
  });
});

describe("users", () => {
  it("rejects e-mails that are not lower case", async () => {
    await expectPgError(
      db.insert(users).values({
        email: "Someone@Example.com",
        firstName: "A",
        lastName: "B",
        passwordHash: "x",
      }),
      CHECK_VIOLATION,
    );
  });
});

describe("project_members", () => {
  it("allows only one owner per project", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const project = await createProject(a.id);
    await db.insert(projectMembers).values({ projectId: project.id, userId: a.id, role: "owner" });

    await expectPgError(
      db.insert(projectMembers).values({ projectId: project.id, userId: b.id, role: "owner" }),
      UNIQUE_VIOLATION,
    );
    await db.insert(projectMembers).values({ projectId: project.id, userId: b.id, role: "member" });
  });
});

describe("invitations", () => {
  it("allows only one pending invitation per project and e-mail", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    const invite = { projectId: project.id, email: "x@example.com", invitedBy: user.id };
    await db.insert(invitations).values({ ...invite, role: "member", status: "declined" });
    await db.insert(invitations).values({ ...invite, role: "member" });

    await expectPgError(db.insert(invitations).values({ ...invite, role: "viewer" }), UNIQUE_VIOLATION);
  });

  it("never invites as owner", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    await expectPgError(
      db
        .insert(invitations)
        .values({ projectId: project.id, email: "x@example.com", invitedBy: user.id, role: "owner" }),
      CHECK_VIOLATION,
    );
  });
});

describe("tags", () => {
  it("is unique per project, case-insensitively (P-05)", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    await db.insert(tags).values(tagValues(project.id, "PT-6824"));

    await expectPgError(db.insert(tags).values(tagValues(project.id, "pt-6824")), UNIQUE_VIOLATION);
  });

  it("allows the same tag again once the old IO list was cleared", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    const [old] = await db.insert(tags).values(tagValues(project.id, "PT-6824")).returning();
    const [clear] = await db
      .insert(ioListClears)
      .values({ projectId: project.id, clearedBy: user.id })
      .returning();
    await db.update(tags).set({ clearedInId: clear.id }).where(eq(tags.id, old.id));

    await db.insert(tags).values(tagValues(project.id, "PT-6824"));
  });

  it("requires a trimmed tag and an upper-case IO type", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    await expectPgError(db.insert(tags).values(tagValues(project.id, " PT-1 ")), CHECK_VIOLATION);
    await expectPgError(
      db.insert(tags).values({ ...tagValues(project.id, "PT-1"), ioType: "ai" }),
      CHECK_VIOLATION,
    );
  });
});

describe("issues", () => {
  it("requires a non-blank description", async () => {
    const user = await createUser();
    const project = await createProject(user.id);
    const [tag] = await db.insert(tags).values(tagValues(project.id, "PT-1")).returning();
    const [type] = await db
      .insert(issueTypes)
      .values({ projectId: project.id, name: "Field", sortOrder: 1 })
      .returning();

    await expectPgError(
      db.insert(issues).values({
        projectId: project.id,
        tagId: tag.id,
        issueTypeId: type.id,
        description: "   ",
        openedBy: user.id,
        updatedBy: user.id,
      }),
      CHECK_VIOLATION,
    );
  });
});

describe("audit_log (REQ-AUD-03)", () => {
  async function insertEntry() {
    const user = await createUser();
    const [entry] = await db
      .insert(auditLog)
      .values({ actorId: user.id, entityType: "user", entityId: user.id, action: "test" })
      .returning();
    return entry;
  }

  it("refuses updates", async () => {
    const entry = await insertEntry();
    await expectPgError(
      db.update(auditLog).set({ action: "tampered" }).where(eq(auditLog.id, entry.id)),
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it("refuses deletes outside the admin purge", async () => {
    const entry = await insertEntry();
    await expectPgError(db.delete(auditLog).where(eq(auditLog.id, entry.id)), INSUFFICIENT_PRIVILEGE);
  });

  it("allows deletes inside a purge transaction", async () => {
    const entry = await insertEntry();
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL loopcheck.allow_audit_purge = 'on'`);
      await tx.delete(auditLog).where(eq(auditLog.id, entry.id));
    });
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});
