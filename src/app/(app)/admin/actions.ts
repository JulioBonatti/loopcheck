"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/session";
import {
  generateTemporaryPassword,
  purgeProject,
  restoreProject,
  transferOwnership,
} from "@/server/services/admin";
import { type ActionError, type ActionResult, toActionResult } from "@/server/services/errors";
import type { Actor } from "@/server/services/permissions";
import { refreshProjectLists } from "../refresh";

async function adminChange<T>(
  change: (actor: Actor) => Promise<T>,
  { projectLists = false } = {},
): Promise<ActionResult<T>> {
  const actor = await requireActor();
  const result = await toActionResult(() => change(actor));
  if (result.ok) {
    // Restores and transfers change other people's project lists too.
    if (projectLists) refreshProjectLists();
    else refresh();
  }
  return result;
}

/** REQ-AUTH-07: the password comes back once, to be copied by the admin. */
export async function generateTemporaryPasswordAction(userId: string) {
  return adminChange((actor) => generateTemporaryPassword(actor, userId));
}

export async function transferOwnershipAction(projectId: string, userId: string) {
  return adminChange((actor) => transferOwnership(actor, { projectId, userId }), {
    projectLists: true,
  });
}

export async function restoreProjectAction(projectId: string) {
  return adminChange((actor) => restoreProject(actor, projectId), { projectLists: true });
}

export type PurgeState = { error?: ActionError; purged?: boolean };

export async function purgeProjectAction(
  projectId: string,
  _: PurgeState,
  formData: FormData,
): Promise<PurgeState> {
  const result = await adminChange((actor) =>
    purgeProject(actor, projectId, { confirmCode: String(formData.get("confirmCode") ?? "") }),
  );
  return result.ok ? { purged: true } : { error: result.error };
}
