/**
 * Session cookie settings, shared by the proxy and the server (REQ-AUTH-04).
 * Kept free of server imports so the proxy stays light.
 */

export const SESSION_COOKIE_NAME = "loopcheck_session";
/** P-02: 14 days, renewed by use. */
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
