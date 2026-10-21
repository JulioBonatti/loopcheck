"use server";

import { requireActor, requireUser } from "@/server/auth/session";
import { countMyInvitations } from "@/server/queries/members";
import { getRecentProject, type RecentProject } from "@/server/queries/projects";

/** Read when the menu opens: any change elsewhere may have moved "Recent". */
export async function getRecentProjectAction(): Promise<RecentProject | null> {
  const actor = await requireActor();
  return getRecentProject(actor.userId);
}

/** Read when the account menu opens: invitations arrive from other people. */
export async function countMyInvitationsAction(): Promise<number> {
  const user = await requireUser();
  return countMyInvitations(user.email);
}
