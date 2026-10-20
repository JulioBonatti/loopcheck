/**
 * Read-only project queries. Reads do not go through `mutate`, but they are
 * always scoped to the signed-in user's memberships.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import type { DateFormat } from "@/lib/dates";
import type { ProjectRole } from "@/lib/permissions";
import { type Db, db as defaultDb } from "@/server/db";
import { projectMembers, projects, revisions, tags } from "@/server/db/schema";

export type ProjectSummary = {
  id: string;
  clientName: string;
  code: string;
  role: ProjectRole;
  /** Name of the current IO list revision; null before the first import. */
  revisionName: string | null;
  /** Countable tags (rule 7) and how many of them are checked out. */
  countableTags: number;
  checkedOutTags: number;
};

/** The user's projects, outside the trash (REQ-UI-02). */
export async function listMyProjects(
  userId: string,
  { db = defaultDb }: { db?: Db } = {},
): Promise<ProjectSummary[]> {
  return (
    db
      .select({
        id: projects.id,
        clientName: projects.clientName,
        code: projects.code,
        role: projectMembers.role,
        revisionName: revisions.name,
        countableTags: sql<number>`count(${tags.id})::int`,
        checkedOutTags: sql<number>`count(${tags.id}) filter (where ${tags.checkout})::int`,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .leftJoin(revisions, eq(revisions.id, projects.currentRevisionId))
      // Countable tags only (SPEC §4.5)
      .leftJoin(
        tags,
        and(
          eq(tags.projectId, projects.id),
          eq(tags.listStatus, "active"),
          eq(tags.inScope, true),
          isNull(tags.clearedInId),
        ),
      )
      .where(and(eq(projectMembers.userId, userId), isNull(projects.deletedAt)))
      .groupBy(projects.id, projectMembers.role, revisions.name)
      .orderBy(asc(projects.clientName), asc(projects.code))
  );
}

/** Same list, read once per request (the header and the page both need it). */
export const listMyProjectsOnce = cache((userId: string) => listMyProjects(userId));

export type ProjectView = {
  id: string;
  clientName: string;
  code: string;
  description: string | null;
  fieldStartDate: string;
  timezone: string;
  dateFormat: DateFormat;
  role: ProjectRole;
  revisionName: string | null;
};

/**
 * A project as its member sees it, or null when it does not exist, is in the
 * trash or the user is not a member (pages show "not found" for all three).
 */
export async function getProjectForUser(
  userId: string,
  projectId: string,
  { db = defaultDb }: { db?: Db } = {},
): Promise<ProjectView | null> {
  if (!z.uuid().safeParse(projectId).success) return null;
  const [row] = await db
    .select({
      id: projects.id,
      clientName: projects.clientName,
      code: projects.code,
      description: projects.description,
      fieldStartDate: projects.fieldStartDate,
      timezone: projects.timezone,
      dateFormat: projects.dateFormat,
      role: projectMembers.role,
      revisionName: revisions.name,
    })
    .from(projects)
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
    )
    .leftJoin(revisions, eq(revisions.id, projects.currentRevisionId))
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  return row ?? null;
}

/** Same project, read once per request (layout, tabs and pages all need it). */
export const getProjectForUserOnce = cache((userId: string, projectId: string) =>
  getProjectForUser(userId, projectId),
);
