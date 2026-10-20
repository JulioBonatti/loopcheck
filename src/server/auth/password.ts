/**
 * Password hashing with argon2id (REQ-AUTH-03, rule 9). The library defaults
 * follow the OWASP recommendation (19 MiB, 2 iterations, 1 lane).
 */
import { hash, verify } from "@node-rs/argon2";

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real check when the e-mail has no account, so
 * response times do not reveal which e-mails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hash("dummy password for timing");
  await verify(await dummyHash, password);
  return false;
}
