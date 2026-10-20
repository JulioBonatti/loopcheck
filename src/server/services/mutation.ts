/**
 * The one way services change data (ARQ-01, rule 2). In a single transaction:
 *   1. check permission (REQ-PERM-01);
 *   2. validate the input with Zod;
 *   3. run the change and record its audit entries.
 * Any error rolls everything back, so a refused or failed action writes
 * nothing — not even an audit entry.
 */
import type { z } from "zod";
import { type Db, db as defaultDb, type Tx } from "@/server/db";
import { type AuditEntry, writeAudit } from "./audit";
import { ValidationError } from "./errors";
import type { Actor } from "./permissions";

export type MutationContext<TAccess> = {
  tx: Tx;
  actor: Actor;
  /** What `authorize` returned, e.g. the actor's project role. */
  access: TAccess;
  /** Queues audit entries; they are written before the transaction commits. */
  audit: (...entries: AuditEntry[]) => void;
};

export type MutationOptions<TSchema extends z.ZodType, TAccess, TResult> = {
  actor: Actor;
  /** Throws `ForbiddenError`/`NotFoundError` when the action is not allowed. */
  authorize: (tx: Tx) => Promise<TAccess> | TAccess;
  schema: TSchema;
  input: unknown;
  run: (ctx: MutationContext<TAccess>, data: z.output<TSchema>) => Promise<TResult>;
  /** Tests pass the test database; the app uses the default connection. */
  db?: Db;
};

export async function mutate<TSchema extends z.ZodType, TAccess, TResult>(
  options: MutationOptions<TSchema, TAccess, TResult>,
): Promise<TResult> {
  const { actor, authorize, schema, input, run, db = defaultDb } = options;

  return db.transaction(async (tx) => {
    const access = await authorize(tx);

    const parsed = schema.safeParse(input);
    if (!parsed.success) throw ValidationError.fromZod(parsed.error);

    const entries: AuditEntry[] = [];
    const result = await run(
      { tx, actor, access, audit: (...e) => entries.push(...e) },
      parsed.data,
    );

    // Every mutation is audited (REQ-AUD-01): forgetting it is a bug.
    if (entries.length === 0) {
      throw new Error("Mutation finished without recording an audit entry");
    }
    await writeAudit(tx, actor.userId, entries);
    return result;
  });
}
