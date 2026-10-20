/**
 * Session cookie and current-user lookup for pages and Server Actions
 * (REQ-AUTH-04). The cookie only carries the random token.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session-cookie";
import type { Actor } from "@/server/services/permissions";
import { type SessionUser, validateSession } from "@/server/services/auth";

/** Only from Server Actions and Route Handlers (Next cannot set cookies while rendering). */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}

/** The signed-in user, or null. Read once per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Session checks compare with the current time: always at request time.
  await connection();
  const token = await readSessionToken();
  if (!token) return null;
  return (await validateSession(token))?.user ?? null;
});

type RequireOptions = {
  /** Only for the page and action that set the new password. */
  allowPendingPasswordChange?: boolean;
};

/**
 * For pages and actions that need a signed-in user. After an admin
 * temporary password, everything leads to setting a new one (REQ-AUTH-07).
 */
export async function requireUser(options: RequireOptions = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.mustChangePassword && !options.allowPendingPasswordChange) {
    redirect("/change-password");
  }
  return user;
}

/** The actor passed to the service layer. */
export async function requireActor(options: RequireOptions = {}): Promise<Actor> {
  const user = await requireUser(options);
  return { userId: user.id, isAdmin: user.isAdmin };
}
