/**
 * Runs before every page request. It does not check the session against the
 * database (pages and Server Actions do that, ARQ-02); it only:
 *   - sends visitors without a session cookie straight to sign in;
 *   - pushes the cookie expiry forward, matching the renewal by use (P-02).
 */
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session-cookie";

const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);

  if (!token) {
    return isPublic ? NextResponse.next() : NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const response = NextResponse.next();
  // Server Actions may have just replaced or cleared the cookie: leave it alone then.
  if (request.method === "GET") {
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  }
  return response;
}

export const config = {
  // Skip Next internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
