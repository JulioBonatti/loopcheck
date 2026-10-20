/**
 * Test data builders for `*.db.test.ts`. Never import from app code.
 */
import { hashPassword } from "@/server/auth/password";
import type { ProjectRole } from "@/lib/permissions";
import type { Actor } from "@/server/services/permissions";
import type { Db } from "./index";
import { projectMembers, projects, tags, users } from "./schema";

let seq = 0;

/** A user whose password is `password` (hashed only when asked: argon2 is slow). */
export async function createUser(
  db: Db,
  { password, ...values }: Partial<typeof users.$inferInsert> & { password?: string } = {},
) {
  seq += 1;
  const [user] = await db
    .insert(users)
    .values({
      email: `user${seq}@example.com`,
      firstName: "User",
      lastName: `${seq}`,
      passwordHash: password ? await hashPassword(password) : "not-a-real-hash",
      ...values,
    })
    .returning();
  return user;
}

export function actorOf(user: { id: string; isAdmin: boolean }): Actor {
  return { userId: user.id, isAdmin: user.isAdmin };
}

export async function createProject(
  db: Db,
  ownerId: string,
  values: Partial<typeof projects.$inferInsert> = {},
) {
  const [project] = await db
    .insert(projects)
    .values({
      clientName: "ACME",
      code: "P-001",
      fieldStartDate: "2026-10-01",
      timezone: "America/Chicago",
      createdBy: ownerId,
      ...values,
    })
    .returning();
  await addMember(db, project.id, ownerId, "owner");
  return project;
}

export async function addMember(db: Db, projectId: string, userId: string, role: ProjectRole) {
  await db.insert(projectMembers).values({ projectId, userId, role });
}

export async function createTag(
  db: Db,
  projectId: string,
  values: Partial<typeof tags.$inferInsert> = {},
) {
  seq += 1;
  const [tag] = await db
    .insert(tags)
    .values({
      projectId,
      tag: `PT-${seq}`,
      description: "Pressure transmitter",
      ioType: "AI",
      ...values,
    })
    .returning();
  return tag;
}
