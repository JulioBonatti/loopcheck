export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://loopcheck:loopcheck@localhost:5432/loopcheck_e2e";

// The setup wipes this database: refuse anything that is not an E2E database.
if (!new URL(E2E_DATABASE_URL).pathname.endsWith("_e2e")) {
  throw new Error(`E2E_DATABASE_URL must point to a *_e2e database (got ${E2E_DATABASE_URL})`);
}
