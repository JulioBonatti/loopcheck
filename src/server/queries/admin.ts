/**
 * Read-only queries for the Administration pages. Callers must check that the
 * user is an admin.
 */
import { aliasedTable, and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DateFormat } from "@/lib/dates";
import { type Db, db as defaultDb } from "@/server/db";
import { projectMembers, projects, users } from "@/server/db/schema";

export type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  /** Set when an admin removed the account. */
  deactivatedAt: Date | null;
  /** Projects outside the trash the user belongs to. */
  projectCount: number;
  /** Projects the user owns, in the trash or not (for removal). */
  ownedProjects: { id: string; clientName: string; code: string; inTrash: boolean }[];
};

export async function listUsers({ db = defaultDb }: { db?: Db } = {}): Promise<AdminUser[]> {
  const [rows, owned] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        isAdmin: users.isAdmin,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
        deactivatedAt: users.deactivatedAt,
        projectCount: sql<number>`count(${projects.id})::int`,
      })
      .from(users)
      .leftJoin(projectMembers, eq(projectMembers.userId, users.id))
      .leftJoin(
        projects,
        and(eq(projects.id, projectMembers.projectId), isNull(projects.deletedAt)),
      )
      .groupBy(users.id)
      .orderBy(asc(users.firstName), asc(users.lastName)),
    db
      .select({
        userId: projectMembers.userId,
        id: projects.id,
        clientName: projects.clientName,
        code: projects.code,
        inTrash: isNotNull(projects.deletedAt).mapWith(Boolean),
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projectMembers.role, "owner"))
      .orderBy(asc(projects.clientName), asc(projects.code)),
  ]);
  return rows.map((u) => ({
    ...u,
    ownedProjects: owned
      .filter((p) => p.userId === u.id)
      .map((p) => ({ id: p.id, clientName: p.clientName, code: p.code, inTrash: p.inTrash })),
  }));
}

const owner = aliasedTable(users, "owner");
const ownerMembership = aliasedTable(projectMembers, "owner_membership");
const memberCount = sql<number>`(
  select count(*)::int from ${projectMembers} where ${projectMembers.projectId} = ${projects.id}
)`;

type ProjectDates = { timezone: string; dateFormat: DateFormat };

export type AdminProject = ProjectDates & {
  id: string;
  clientName: string;
  code: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  createdAt: Date;
};

/** Every project outside the trash, for ownership transfer (REQ-PROJ-05). */
export async function listAllProjects({ db = defaultDb }: { db?: Db } = {}): Promise<
  AdminProject[]
> {
  const rows = await db
    .select({
      id: projects.id,
      clientName: projects.clientName,
      code: projects.code,
      timezone: projects.timezone,
      dateFormat: projects.dateFormat,
      createdAt: projects.createdAt,
      ownerId: owner.id,
      ownerFirst: owner.firstName,
      ownerLast: owner.lastName,
      ownerEmail: owner.email,
      memberCount,
    })
    .from(projects)
    .leftJoin(
      ownerMembership,
      and(eq(ownerMembership.projectId, projects.id), eq(ownerMembership.role, "owner")),
    )
    .leftJoin(owner, eq(owner.id, ownerMembership.userId))
    .where(isNull(projects.deletedAt))
    .orderBy(asc(projects.clientName), asc(projects.code));
  return rows.map(({ ownerFirst, ownerLast, ...r }) => ({
    ...r,
    ownerName: ownerFirst === null ? null : `${ownerFirst} ${ownerLast}`,
  }));
}

const deleter = aliasedTable(users, "deleter");

export type TrashedProject = ProjectDates & {
  id: string;
  clientName: string;
  code: string;
  deletedAt: Date;
  deletedBy: string | null;
  memberCount: number;
  /** False when the owner's account was removed: restoring needs a new owner. */
  hasOwner: boolean;
};

/** Projects in the trash, most recently deleted first (REQ-PROJ-04). */
export async function listTrashedProjects({ db = defaultDb }: { db?: Db } = {}): Promise<
  TrashedProject[]
> {
  const rows = await db
    .select({
      id: projects.id,
      clientName: projects.clientName,
      code: projects.code,
      timezone: projects.timezone,
      dateFormat: projects.dateFormat,
      deletedAt: projects.deletedAt,
      deleterFirst: deleter.firstName,
      deleterLast: deleter.lastName,
      memberCount,
      hasOwner: sql<boolean>`exists (
        select 1 from ${projectMembers}
        where ${projectMembers.projectId} = ${projects.id} and ${projectMembers.role} = 'owner'
      )`,
    })
    .from(projects)
    .leftJoin(deleter, eq(deleter.id, projects.deletedBy))
    .where(isNotNull(projects.deletedAt))
    .orderBy(desc(projects.deletedAt));
  return rows.map(({ deleterFirst, deleterLast, deletedAt, ...r }) => ({
    ...r,
    deletedAt: deletedAt as Date,
    deletedBy: deleterFirst === null ? null : `${deleterFirst} ${deleterLast}`,
  }));
}
