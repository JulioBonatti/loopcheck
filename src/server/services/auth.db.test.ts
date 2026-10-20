import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "@/server/auth/tokens";
import { auditLog, loginAttempts, sessions, users } from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import {
  ATTEMPT_WINDOW_MS,
  MAX_FAILED_ATTEMPTS,
  signIn,
  signOut,
  signUp,
  TooManyAttemptsError,
  validateSession,
} from "./auth";
import { ValidationError } from "./errors";

const db = getTestDb();
const DAY_MS = 24 * 60 * 60 * 1000;

const ana = { firstName: "Ana", lastName: "Lima", email: "ana@example.com", password: "secret" };
const bob = { firstName: "Bob", lastName: "Reis", email: "bob@example.com", password: "hunter2" };

/** Sign-up input: the password typed twice. */
function newAccount(person: typeof ana) {
  return { ...person, confirmPassword: person.password };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => expect.fail("expected the call to fail"),
    (e: unknown) => e,
  );
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("signUp (REQ-AUTH-01, REQ-AUTH-05)", () => {
  it("makes only the first user an admin", async () => {
    const first = await signUp(newAccount(ana), { db });
    const second = await signUp(newAccount(bob), { db });

    expect(first.user.isAdmin).toBe(true);
    expect(second.user.isAdmin).toBe(false);
  });

  it("makes exactly one admin when the first sign-ups happen at once", async () => {
    await Promise.all([signUp(newAccount(ana), { db }), signUp(newAccount(bob), { db })]);

    const admins = await db.select().from(users).where(eq(users.isAdmin, true));
    expect(admins).toHaveLength(1);
  });

  it("stores the e-mail in lower case and the password only as argon2id (REQ-AUTH-03)", async () => {
    await signUp({ ...newAccount(ana), email: "  Ana@Example.COM " }, { db });

    const [user] = await db.select().from(users);
    expect(user.email).toBe("ana@example.com");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(ana.password);
  });

  it("refuses an e-mail that already has an account, in any case", async () => {
    await signUp(newAccount(ana), { db });

    const error = await rejection(signUp({ ...newAccount(bob), email: "ANA@example.com" }, { db }));

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors.email).toEqual([
      "An account with this email already exists.",
    ]);
  });

  it("requires the password typed twice", async () => {
    const error = await rejection(signUp({ ...ana, confirmPassword: "secreT" }, { db }));

    expect((error as ValidationError).fieldErrors).toEqual({
      confirmPassword: ["Passwords do not match."],
    });
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("validates every field", async () => {
    const error = await rejection(
      signUp(
        { firstName: " ", lastName: "", email: "not-an-email", password: "", confirmPassword: "" },
        { db },
      ),
    );

    expect(Object.keys((error as ValidationError).fieldErrors).sort()).toEqual([
      "email",
      "firstName",
      "lastName",
      "password",
    ]);
  });

  it("audits the sign-up without the password", async () => {
    const { user } = await signUp(newAccount(ana), { db });

    const log = await db.select().from(auditLog).where(eq(auditLog.action, "user.sign_up"));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorId: user.id, entityId: user.id });
    expect(JSON.stringify(log[0])).not.toMatch(/argon2|secret/);
  });
});

describe("signIn (REQ-AUTH-02)", () => {
  it("accepts the e-mail in any case and returns a session", async () => {
    await signUp(newAccount(ana), { db });

    const { user, token } = await signIn({ email: "ANA@example.com", password: "secret" }, { db });

    expect(user.email).toBe("ana@example.com");
    expect((await validateSession(token, { db }))?.user.id).toBe(user.id);
  });

  it("gives the same generic error for a wrong password and an unknown e-mail", async () => {
    await signUp(newAccount(ana), { db });

    const wrongPassword = await rejection(signIn({ ...ana, password: "nope" }, { db }));
    const unknownEmail = await rejection(signIn({ ...bob }, { db }));

    expect((wrongPassword as Error).message).toBe("Invalid email or password.");
    expect((unknownEmail as Error).message).toBe("Invalid email or password.");
  });

  it("stores only a hash of the session token", async () => {
    await signUp(newAccount(ana), { db });
    const { token } = await signIn(ana, { db });

    const rows = await db.select().from(sessions);
    expect(rows.map((s) => s.tokenHash)).toContain(hashSessionToken(token));
    expect(rows.map((s) => s.tokenHash)).not.toContain(token);
  });
});

describe("failed attempts limit (REQ-AUTH-08, P-03)", () => {
  async function failTimes(times: number, now: Date) {
    for (let i = 0; i < times; i++) {
      await rejection(signIn({ ...ana, password: "wrong" }, { db, now }));
    }
  }

  it("blocks the e-mail after 10 failures in 15 minutes, even with the right password", async () => {
    await signUp(newAccount(ana), { db });
    const now = new Date("2026-10-20T12:00:00Z");
    await failTimes(MAX_FAILED_ATTEMPTS, now);

    const error = await rejection(signIn(ana, { db, now }));

    expect(error).toBeInstanceOf(TooManyAttemptsError);
    expect((error as TooManyAttemptsError).retryAfterMinutes).toBe(15);
  });

  it("lets the user in again once the window has passed", async () => {
    await signUp(newAccount(ana), { db });
    const start = new Date("2026-10-20T12:00:00Z");
    await failTimes(MAX_FAILED_ATTEMPTS, start);

    const later = new Date(start.getTime() + ATTEMPT_WINDOW_MS + 1000);
    await expect(signIn(ana, { db, now: later })).resolves.toBeDefined();
  });

  it("resets the count after a successful sign-in", async () => {
    await signUp(newAccount(ana), { db });
    const now = new Date("2026-10-20T12:00:00Z");
    await failTimes(MAX_FAILED_ATTEMPTS - 1, now);
    await signIn(ana, { db, now });

    expect(await db.select().from(loginAttempts)).toHaveLength(0);
  });

  it("does not block other e-mails", async () => {
    await signUp(newAccount(ana), { db });
    await signUp(newAccount(bob), { db });
    const now = new Date("2026-10-20T12:00:00Z");
    await failTimes(MAX_FAILED_ATTEMPTS, now);

    await expect(signIn(bob, { db, now })).resolves.toBeDefined();
  });
});

describe("sessions (REQ-AUTH-04, P-02)", () => {
  it("expires after 14 days without use", async () => {
    const start = new Date("2026-10-01T12:00:00Z");
    const { token } = await signUp(newAccount(ana), { db, now: start });

    const justBefore = new Date(start.getTime() + 14 * DAY_MS - 1000);
    const after = new Date(start.getTime() + 14 * DAY_MS + 1000);
    // Expired check first: a successful check would renew the session.
    expect(await validateSession(token, { db, now: after })).toBeNull();
    expect(await validateSession(token, { db, now: justBefore })).not.toBeNull();
  });

  it("is renewed by use, at most once a day", async () => {
    const start = new Date("2026-10-01T12:00:00Z");
    const { token } = await signUp(newAccount(ana), { db, now: start });

    const sameDay = await validateSession(token, { db, now: new Date(start.getTime() + 3600_000) });
    expect(sameDay?.expiresAt.getTime()).toBe(start.getTime() + 14 * DAY_MS);

    const tenDaysLater = new Date(start.getTime() + 10 * DAY_MS);
    const renewed = await validateSession(token, { db, now: tenDaysLater });
    expect(renewed?.expiresAt.getTime()).toBe(tenDaysLater.getTime() + 14 * DAY_MS);

    // Still valid 20 days after sign-up, thanks to the renewal
    const twentyDaysLater = new Date(start.getTime() + 20 * DAY_MS);
    expect(await validateSession(token, { db, now: twentyDaysLater })).not.toBeNull();
  });

  it("ends on sign out, without touching the user's other sessions", async () => {
    const { token: first } = await signUp(newAccount(ana), { db });
    const { token: second } = await signIn(ana, { db });

    await signOut(first, { db });

    expect(await validateSession(first, { db })).toBeNull();
    expect(await validateSession(second, { db })).not.toBeNull();
    const actions = (await db.select().from(auditLog)).map((e) => e.action);
    expect(actions).toContain("auth.sign_out");
  });

  it("rejects unknown tokens", async () => {
    expect(await validateSession("made-up-token", { db })).toBeNull();
  });
});
