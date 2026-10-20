"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/server/auth/session";
import { signIn, signOut, signUp } from "@/server/services/auth";
import { type ActionError, toActionResult } from "@/server/services/errors";

/** Form state for `useActionState`: the error, and the values to show again. */
export type AuthFormState = {
  error?: ActionError;
  values?: Record<string, string>;
};

/** Text fields of the form; passwords are never sent back to the browser. */
function readForm(formData: FormData, fields: string[]) {
  return Object.fromEntries(fields.map((f) => [f, String(formData.get(f) ?? "")]));
}

export async function signUpAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = readForm(formData, ["firstName", "lastName", "email"]);
  const result = await toActionResult(() =>
    signUp({ ...values, password: String(formData.get("password") ?? "") }),
  );
  if (!result.ok) return { error: result.error, values };

  await setSessionCookie(result.data.token);
  redirect("/");
}

export async function signInAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = readForm(formData, ["email"]);
  const result = await toActionResult(() =>
    signIn({ ...values, password: String(formData.get("password") ?? "") }),
  );
  if (!result.ok) return { error: result.error, values };

  await setSessionCookie(result.data.token);
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await signOut(token);
  await clearSessionCookie();
  redirect("/sign-in");
}
