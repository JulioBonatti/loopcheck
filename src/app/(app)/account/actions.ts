"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { readSessionToken, requireActor, requireUser } from "@/server/auth/session";
import { changePassword } from "@/server/services/account";
import { type ActionError, type ActionResult, toActionResult } from "@/server/services/errors";
import { leaveProject } from "@/server/services/members";

export type ChangePasswordState = { error?: ActionError; done?: boolean };

/** REQ-AUTH-06; also completes a forced change (REQ-AUTH-07). */
export async function changePasswordAction(
  _: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser({ allowPendingPasswordChange: true });
  const token = (await readSessionToken()) ?? "";
  const result = await toActionResult(() =>
    changePassword({ userId: user.id, isAdmin: user.isAdmin }, token, {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    }),
  );
  if (!result.ok) return { error: result.error };
  // A forced change was blocking the app: go in now.
  if (user.mustChangePassword) redirect("/");
  return { done: true };
}

export async function leaveProjectAction(projectId: string): Promise<ActionResult<void>> {
  const actor = await requireActor();
  const result = await toActionResult(() => leaveProject(actor, projectId));
  if (result.ok) refresh();
  return result;
}
