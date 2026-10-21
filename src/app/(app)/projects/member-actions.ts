"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/session";
import { type ActionError, type ActionResult, toActionResult } from "@/server/services/errors";
import {
  cancelInvitation,
  changeMemberRole,
  inviteMember,
  removeMember,
} from "@/server/services/members";
import type { Actor } from "@/server/services/permissions";

export type InviteState = {
  error?: ActionError;
  values?: Record<string, string>;
  invited?: string;
};

/** REQ-MEM-01. Bound to the project id in the form. */
export async function inviteMemberAction(
  projectId: string,
  _: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const actor = await requireActor();
  const values = {
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
  const result = await toActionResult(() => inviteMember(actor, projectId, values));
  if (!result.ok) return { error: result.error, values };
  refresh();
  return { invited: result.data.email };
}

/** Runs a member change, then refreshes the page that shows the lists. */
async function memberChange(
  change: (actor: Actor) => Promise<void>,
): Promise<ActionResult<void>> {
  const actor = await requireActor();
  const result = await toActionResult(() => change(actor));
  if (result.ok) refresh();
  return result;
}

export async function cancelInvitationAction(projectId: string, invitationId: string) {
  return memberChange((actor) => cancelInvitation(actor, projectId, invitationId));
}

export async function changeMemberRoleAction(projectId: string, userId: string, role: string) {
  return memberChange((actor) => changeMemberRole(actor, projectId, { userId, role }));
}

export async function removeMemberAction(projectId: string, userId: string) {
  return memberChange((actor) => removeMember(actor, projectId, userId));
}
