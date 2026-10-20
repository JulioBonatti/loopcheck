/**
 * Playwright global setup: E2E tests run the real app against their own
 * database (`loopcheck_e2e`), rebuilt on every run. The dev database is never
 * touched — otherwise the first test user would become its admin.
 */
import { ensureDatabase, rebuildSchema } from "../../src/server/db/rebuild";
import { E2E_DATABASE_URL } from "./env";

export default async function globalSetup() {
  await ensureDatabase(E2E_DATABASE_URL);
  await rebuildSchema(E2E_DATABASE_URL);
}
