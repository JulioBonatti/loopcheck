/**
 * Read-only queries for members and invitations. Callers check that the user
 * may see the project (Project settings is for owners and members).
 */
import { aliasedTable, and, asc, count, desc, eq, isNull } from "drizzle-orm";
import type { DateFormat } from "@/lib/dates";
import type { ProjectRole } from "@/lib/permissions";
import { type Db, db as defaultDb } from "@/server/db";
import { invitations, projectMembers, projects, users } from "@/server/db/schema";

export type ProjectMember = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: ProjectRole;
  addedAt: Date;
};

/** Owner first, then by name (REQ-SET-07). */
export async function listProjectMembers(
  projectId: string,
  { db = defaultDb }: { db?: Db } = {},
): Promise<ProjectMember[]> {
  const rows = await db
    .select({
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: projectMembers.role,
      addedAt: projectMembers.addedAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.firstName), asc(users.lastName));
  return rows.sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
}

const inviter = aliasedTable(users, "inviter");

export type PendingInvitation = {
  id: string;
  email: string;
  role: ProjectRole;
  invitedBy: string;
  createdAt: Date;
};

/** The project's pending invitations, newest first (REQ-MEM-04). */
export async function listProjectInvitations(
  projectId: string,
  { db = defaultDb }: { db?: Db } = {},
): Promise<PendingInvitation[]> {
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      inviterFirst: inviter.firstName,
      inviterLast: inviter.lastName,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .innerJoin(inviter, eq(inviter.id, invitations.invitedBy))
    .where(and(eq(invitations.projectId, projectId), eq(invitations.status, "pending")))
    .orderBy(desc(invitations.createdAt));
  return rows.map(({ inviterFirst, inviterLast, ...r }) => ({
    ...r,
    invitedBy: `${inviterFirst} ${inviterLast}`,
  }));
}

export type MyInvitation = PendingInvitation & {
  projectId: string;
  clientName: string;
  code: string;
  /** For showing the date in the project's format (REQ-UI-05). */
  timezone: string;
  dateFormat: DateFormat;
};

function myPendingInvitations(email: string) {
  return and(
    eq(invitations.email, email),
    eq(invitations.status, "pending"),
    isNull(projects.deletedAt),
  );
}

/** Pending invitations sent to the user's e-mail (REQ-ACC-02). */
export async function listMyInvitations(
  email: string,
  { db = defaultDb }: { db?: Db } = {},
): Promise<MyInvitation[]> {
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      inviterFirst: inviter.firstName,
      inviterLast: inviter.lastName,
      createdAt: invitations.createdAt,
      projectId: projects.id,
      clientName: projects.clientName,
      code: projects.code,
      timezone: projects.timezone,
      dateFormat: projects.dateFormat,
    })
    .from(invitations)
    .innerJoin(projects, eq(projects.id, invitations.projectId))
    .innerJoin(inviter, eq(inviter.id, invitations.invitedBy))
    .where(myPendingInvitations(email))
    .orderBy(desc(invitations.createdAt));
  return rows.map(({ inviterFirst, inviterLast, ...r }) => ({
    ...r,
    invitedBy: `${inviterFirst} ${inviterLast}`,
  }));
}

/** The number on the invitation badges (REQ-MEM-05). */
export async function countMyInvitations(
  email: string,
  { db = defaultDb }: { db?: Db } = {},
): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(invitations)
    .innerJoin(projects, eq(projects.id, invitations.projectId))
    .where(myPendingInvitations(email));
  return total;
}
