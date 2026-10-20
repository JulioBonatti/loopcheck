/**
 * The signed-in user's own account (SPEC §7.2).
 */
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db";
import { sessions, users } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { hashSessionToken } from "@/server/auth/tokens";
import { newPassword, PASSWORDS_DO_NOT_MATCH, passwordsMatch } from "./auth";
import { NotFoundError, ValidationError } from "./errors";
import { mutate } from "./mutation";
import type { Actor } from "./permissions";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, PASSWORDS_DO_NOT_MATCH)
  .refine((d) => d.password !== d.currentPassword, {
    message: "Choose a password different from the current one.",
    path: ["password"],
  });

/**
 * REQ-AUTH-06: ends the user's other sessions; the one in use stays signed
 * in. Also clears the forced change after a temporary password (REQ-AUTH-07).
 */
export function changePassword(
  actor: Actor,
  currentSessionToken: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return mutate({
    db,
    actor,
    // Any signed-in user may change their own password.
    authorize: () => undefined,
    schema: changePasswordSchema,
    input,
    run: async ({ tx, audit }, data) => {
      const [user] = await tx
        .select({ passwordHash: users.passwordHash, mustChangePassword: users.mustChangePassword })
        .from(users)
        .where(eq(users.id, actor.userId))
        .for("update");
      if (!user) throw new NotFoundError("User");
      if (!(await verifyPassword(user.passwordHash, data.currentPassword))) {
        throw new ValidationError(undefined, {
          currentPassword: ["Current password is incorrect."],
        });
      }

      const passwordHash = await hashPassword(data.password);
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: false })
        .where(eq(users.id, actor.userId));
      await tx
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, actor.userId),
            ne(sessions.tokenHash, hashSessionToken(currentSessionToken)),
          ),
        );

      audit({
        action: "user.change_password",
        entityType: "user",
        entityId: actor.userId,
        before: user,
        after: { passwordHash, mustChangePassword: false },
      });
    },
  });
}
