import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    env: { SESSION_SECRET: "test-only-session-secret-0123456789abcdef" },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts"],
        },
      },
      {
        // Integration tests against the real Postgres (`npm run db:up`)
        extends: true,
        test: {
          name: "db",
          include: ["src/**/*.db.test.ts"],
          globalSetup: ["src/server/db/test-global-setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
