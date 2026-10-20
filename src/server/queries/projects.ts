/**
 * Read-only project queries. Reads do not go through `mutate`, but they are
 * always scoped to the signed-in user's memberships.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { cache } from "react";
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
