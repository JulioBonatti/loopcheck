"use server";

import { requireActor } from "@/server/auth/session";
import { getRecentProject, type RecentProject } from "@/server/queries/projects";

/** Read when the menu opens: any change elsewhere may have moved "Recent". */
export async function getRecentProjectAction(): Promise<RecentProject | null> {
  const actor = await requireActor();
  return getRecentProject(actor.userId);
}
