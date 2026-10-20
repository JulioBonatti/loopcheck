/** Postgres error details, through Drizzle's wrapping of the driver error. */

function pgError(error: unknown): (Error & Record<string, unknown>) | undefined {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ("code" in e && typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
      return e as Error & Record<string, unknown>;
    }
  }
  return undefined;
}

/** SQLSTATE of a failed query, e.g. "23505" for a unique violation. */
export function pgErrorCode(error: unknown): string | undefined {
  return pgError(error)?.code as string | undefined;
}

/** True when the query broke the named unique index or constraint. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = pgError(error);
  return e?.code === "23505" && e.constraint_name === constraint;
}
