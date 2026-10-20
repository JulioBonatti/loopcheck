/**
 * Test support: drops everything in a database and applies the migrations,
 * so tests always run against the real schema. Never use on real data.
 */
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb } from "./index";

const silent = { onnotice: () => {} };

/** Creates the database if it does not exist yet (needs the CREATEDB right). */
export async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = postgres(admin.toString(), silent);
  try {
    const [row] = await client`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (!row) await client.unsafe(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
  } finally {
    await client.end();
  }
}

export async function rebuildSchema(url: string): Promise<void> {
  const db = createDb(url, silent);
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
