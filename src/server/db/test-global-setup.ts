/**
 * Vitest global setup for the `db` project: recreates the test database
 * schema from the migrations, so tests always run against the real schema.
 */
import { rebuildSchema } from "./rebuild";
import { testDatabaseUrl } from "./testing";

export default async function setup() {
  await rebuildSchema(testDatabaseUrl());
}
