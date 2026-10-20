/**
 * Vitest global setup for the `db` project: recreates the test database
 * schema from the migrations, so tests always run against the real schema.
 */
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./index";
import { testDatabaseUrl } from "./testing";

export default async function setup() {
  const url = testDatabaseUrl();
  // Silence NOTICEs such as "schema drizzle does not exist, skipping".
  const db = createDb(url, { onnotice: () => {} });
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`DROP SCHEMA public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    await migrate(db, { migrationsFolder: "src/server/db/migrations" });
  } catch (error) {
    throw new Error(
      `Could not prepare the test database at ${new URL(url).host}. ` +
        "Is Postgres running? Try `npm run db:up`.",
      { cause: error },
    );
  } finally {
    await db.$client.end();
  }
}
