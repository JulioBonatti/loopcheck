import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { actorOf, createUser } from "@/server/db/fixtures";
import { auditLog, users } from "@/server/db/schema";
import { getTestDb, truncateAll } from "@/server/db/testing";
import { changePassword } from "./account";
import { signIn, validateSession } from "./auth";
import { ValidationError } from "./errors";

const db = getTestDb();

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

async function signedInTwice(values: Parameters<typeof createUser>[1] = {}) {
  const user = await createUser(db, { password: "old-secret", ...values });
  const credentials = { email: user.email, password: "old-secret" };
  const here = await signIn(credentials, { db });
  const elsewhere = await signIn(credentials, { db });
  return { user, here: here.token, elsewhere: elsewhere.token };
}

const change = {
  currentPassword: "old-secret",
  password: "new-secret",
  confirmPassword: "new-secret",
};

describe("changePassword (REQ-AUTH-06)", () => {
  it("changes the password and ends only the other sessions", async () => {
    const { user, here, elsewhere } = await signedInTwice();

    await changePassword(actorOf(user), here, change, { db });

    expect(await validateSession(here, { db })).not.toBeNull();
    expect(await validateSession(elsewhere, { db })).toBeNull();
    await expect(
      signIn({ email: user.email, password: "new-secret" }, { db }),
    ).resolves.toBeDefined();
    await expect(signIn({ email: user.email, password: "old-secret" }, { db })).rejects.toThrow(
      "Invalid email or password.",
    );
  });

  it("requires the current password", async () => {
    const { user, here, elsewhere } = await signedInTwice();

    const error = await rejection(
      changePassword(actorOf(user), here, { ...change, currentPassword: "guess" }, { db }),
    );

    expect((error as ValidationError).fieldErrors).toEqual({
      currentPassword: ["Current password is incorrect."],
    });
    expect(await validateSession(elsewhere, { db })).not.toBeNull();
  });

  it("requires the new password typed twice and different from the current one", async () => {
    const { user, here } = await signedInTwice();
    const actor = actorOf(user);

    const mismatch = await rejection(
      changePassword(actor, here, { ...change, confirmPassword: "new-secreT" }, { db }),
    );
    const same = await rejection(
      changePassword(
        actor,
        here,
        { ...change, password: "old-secret", confirmPassword: "old-secret" },
        { db },
      ),
    );

    expect((mismatch as ValidationError).fieldErrors.confirmPassword).toBeDefined();
    expect((same as ValidationError).fieldErrors.password).toEqual([
      "Choose a password different from the current one.",
    ]);
  });

  it("clears a forced change (REQ-AUTH-07)", async () => {
    const { user, here } = await signedInTwice({ mustChangePassword: true });

    await changePassword(actorOf(user), here, change, { db });

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.mustChangePassword).toBe(false);
  });

  it("is audited without the hashes", async () => {
    const { user, here } = await signedInTwice();

    await changePassword(actorOf(user), here, change, { db });

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "user.change_password"));
    expect(entry).toMatchObject({
      actorId: user.id,
      before: { passwordHash: "[redacted]" },
      after: { passwordHash: "[redacted]" },
    });
  });
});
