/**
 * Helpers for integration tests (`*.db.test.ts`). Never import from app code.
 */
import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "./index";

/** In test mode Next.js skips `.env.local`; override with `.env.test.local`. */
export function testDatabaseUrl(): string {
  loadEnvConfig(process.cwd());
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://loopcheck:loopcheck@localhost:5432/loopcheck_test";
  // The test setup wipes this database: refuse anything that is not a test DB.
  if (!new URL(url).pathname.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL must point to a *_test database (got ${url})`);
  }
  return url;
}

let testDb: Db | undefined;

export function getTestDb(): Db {
  testDb ??= createDb(testDatabaseUrl());
  return testDb;
}

/** Empties every table. TRUNCATE does not fire the audit_log row trigger. */
export async function truncateAll(db: Db = getTestDb()) {
  await db.execute(sql`
    DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', r.tablename);
      END LOOP;
    END $$;
  `);
}

/** Postgres SQLSTATE of a failed query (Drizzle wraps the driver error). */
export function pgErrorCode(error: unknown): string | undefined {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ("code" in e && typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
      return e.code;
    }
  }
  return undefined;
}
