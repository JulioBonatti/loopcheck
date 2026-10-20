import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string, options?: postgres.Options<Record<string, never>>) {
  const client = postgres(url, options);
  return drizzle({ client, schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;
/** A transaction handle, as received inside `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { loopcheckDb?: Db };

function getDb(): Db {
  if (!globalForDb.loopcheckDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
    globalForDb.loopcheckDb = createDb(url);
  }
  return globalForDb.loopcheckDb;
}

/** Lazily connected, so importing this module never needs the env at build time. */
export const db = new Proxy({} as Db, {
  get: (_, prop) => Reflect.get(getDb(), prop),
});
