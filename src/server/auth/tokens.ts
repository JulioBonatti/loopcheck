/**
 * Session tokens. The browser keeps the random token; the database keeps only
 * an HMAC of it, so a leaked `sessions` table cannot be used to sign in.
 */
import { createHmac, randomBytes } from "node:crypto";

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters (see .env.example)");
  }
  return secret;
}

export function hashSessionToken(token: string, secret: string = sessionSecret()): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}
