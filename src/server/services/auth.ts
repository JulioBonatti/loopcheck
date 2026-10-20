/**
 * Sign up, sign in, sign out and session validation (SPEC §5.1).
 *
 * These run before there is a signed-in actor, so they do not go through
 * `mutate`; they still validate with Zod and write the audit entry in the
 * same transaction as the change (ARQ-01).
 */
import { and, count, desc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-cookie";
import { type Db, db as defaultDb, type Tx } from "@/server/db";
import { loginAttempts, sessions, users } from "@/server/db/schema";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/auth/password";
import { generateSessionToken, hashSessionToken } from "@/server/auth/tokens";
import { writeAudit } from "./audit";
import { ValidationError } from "./errors";

const DAY_MS = 24 * 60 * 60 * 1000;
/** P-02: sessions last 14 days, renewed by use (same as the cookie). */
const SESSION_MS = SESSION_MAX_AGE_SECONDS * 1000;
/** Renew at most once a day, so requests do not all write to the database. */
const RENEW_AFTER_MS = DAY_MS;
/** P-03: 10 failed attempts per e-mail in 15 minutes block that e-mail. */
export const MAX_FAILED_ATTEMPTS = 10;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const INVALID_CREDENTIALS = "Invalid email or password.";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));
const name = (label: string) =>
  z.string().trim().min(1, `${label} is required.`).max(100, `${label} is too long.`);
// No complexity rules (REQ-AUTH-01); the cap only keeps hashing cheap.
export const newPassword = z
  .string()
  .min(1, "Password is required.")
  .max(256, "Password is too long.");

/** Typing the new password twice catches typos (decision of 2026-10-20). */
export function passwordsMatch(data: { password: string; confirmPassword: string }) {
  return data.password === data.confirmPassword;
}
export const PASSWORDS_DO_NOT_MATCH = {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
};

export const signUpSchema = z
  .object({
    firstName: name("First name"),
    lastName: name("Last name"),
    email,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, PASSWORDS_DO_NOT_MATCH);

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email is required."),
  password: z.string().min(1, "Password is required."),
});

/** What the app knows about the signed-in user. Never includes the hash. */
export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

const sessionUserColumns = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  isAdmin: users.isAdmin,
  mustChangePassword: users.mustChangePassword,
};

export type NewSession = { user: SessionUser; token: string; expiresAt: Date };

type Options = { db?: Db; now?: Date };

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  return parsed.data;
}

async function createSession(tx: Tx, userId: string, now: Date) {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  const [session] = await tx
    .insert(sessions)
    .values({ userId, tokenHash: hashSessionToken(token), expiresAt, createdAt: now })
    .returning({ id: sessions.id });
  return { id: session.id, token, expiresAt };
}

/**
 * REQ-AUTH-01, REQ-AUTH-05. The first account becomes admin. Invitations sent
 * to this e-mail show up on their own, since they are matched by e-mail
 * (REQ-MEM-03).
 */
export async function signUp(
  input: unknown,
  { db = defaultDb, now = new Date() }: Options = {},
): Promise<NewSession> {
  const data = parse(signUpSchema, input);
  const passwordHash = await hashPassword(data.password);

  return db.transaction(async (tx) => {
    // Serialize sign-ups so two simultaneous "first" users cannot both be admin.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('loopcheck.sign_up'))`);

    const [taken] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email));
    if (taken) {
      throw new ValidationError(undefined, {
        email: ["An account with this email already exists."],
      });
    }
    const [{ total }] = await tx.select({ total: count() }).from(users);

    const [user] = await tx
      .insert(users)
      .values({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash,
        isAdmin: total === 0,
      })
      .returning(sessionUserColumns);
    const session = await createSession(tx, user.id, now);

    const after = {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isAdmin: user.isAdmin,
    };
    await writeAudit(tx, user.id, [
      { action: "user.sign_up", entityType: "user", entityId: user.id, after },
      { action: "auth.sign_in", entityType: "session", entityId: session.id },
    ]);
    return { user, token: session.token, expiresAt: session.expiresAt };
  });
}

export class TooManyAttemptsError extends ValidationError {
  constructor(readonly retryAfterMinutes: number) {
    super(
      `Too many failed sign-in attempts. Try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`,
    );
  }
}

/** REQ-AUTH-02, REQ-AUTH-08. */
export async function signIn(
  input: unknown,
  { db = defaultDb, now = new Date() }: Options = {},
): Promise<NewSession> {
  const data = parse(signInSchema, input);
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS);

  // Blocked: no password check and no new attempt recorded, so the block
  // ends 15 minutes after the attempts that caused it.
  const recent = await db
    .select({ at: loginAttempts.attemptedAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, data.email), gt(loginAttempts.attemptedAt, windowStart)))
    .orderBy(desc(loginAttempts.attemptedAt))
    .limit(MAX_FAILED_ATTEMPTS);
  if (recent.length >= MAX_FAILED_ATTEMPTS) {
    const unblockAt = recent[MAX_FAILED_ATTEMPTS - 1].at.getTime() + ATTEMPT_WINDOW_MS;
    throw new TooManyAttemptsError(Math.max(1, Math.ceil((unblockAt - now.getTime()) / 60_000)));
  }

  const [found] = await db
    .select({ user: sessionUserColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, data.email));
  const valid = found
    ? await verifyPassword(found.passwordHash, data.password)
    : await verifyAgainstDummy(data.password);

  if (!found || !valid) {
    await db.transaction(async (tx) => {
      await tx.insert(loginAttempts).values({ email: data.email, attemptedAt: now });
      // Housekeeping: old attempts no longer matter.
      await tx
        .delete(loginAttempts)
        .where(lt(loginAttempts.attemptedAt, new Date(now.getTime() - DAY_MS)));
    });
    throw new ValidationError(INVALID_CREDENTIALS);
  }

  const { user } = found;
  return db.transaction(async (tx) => {
    await tx.delete(loginAttempts).where(eq(loginAttempts.email, data.email));
    await tx.delete(sessions).where(and(eq(sessions.userId, user.id), lt(sessions.expiresAt, now)));
    const session = await createSession(tx, user.id, now);
    await writeAudit(tx, user.id, [
      { action: "auth.sign_in", entityType: "session", entityId: session.id },
    ]);
    return { user, token: session.token, expiresAt: session.expiresAt };
  });
}

/** REQ-AUTH-04: sign out ends the session in the database. */
export async function signOut(token: string, { db = defaultDb }: Options = {}): Promise<void> {
  await db.transaction(async (tx) => {
    const [session] = await tx
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(token)))
      .returning({ id: sessions.id, userId: sessions.userId });
    if (session) {
      await writeAudit(tx, session.userId, [
        { action: "auth.sign_out", entityType: "session", entityId: session.id },
      ]);
    }
  });
}

/**
 * The user of a valid session, or null. Extends the session by use (P-02),
 * at most once a day.
 */
export async function validateSession(
  token: string,
  { db = defaultDb, now = new Date() }: Options = {},
): Promise<{ user: SessionUser; expiresAt: Date } | null> {
  const [row] = await db
    .select({ user: sessionUserColumns, sessionId: sessions.id, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now)));
  if (!row) return null;

  const renewedExpiry = new Date(now.getTime() + SESSION_MS);
  if (renewedExpiry.getTime() - row.expiresAt.getTime() >= RENEW_AFTER_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: renewedExpiry })
      .where(eq(sessions.id, row.sessionId));
    return { user: row.user, expiresAt: renewedExpiry };
  }
  return { user: row.user, expiresAt: row.expiresAt };
}
