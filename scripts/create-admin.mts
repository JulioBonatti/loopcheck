/**
 * IT tool: creates an administrator, or promotes an existing account.
 * Admins are not managed in the app (decision of 2026-10-21).
 *
 *   npm run admin:create -- --email admin@company.com --first Ana --last Lima --password '…'
 *
 * Uses DATABASE_URL from the same .env files as Next.js. To remove an admin,
 * IT runs in the database:  UPDATE users SET is_admin = false WHERE email = '…';
 */
import { parseArgs } from "node:util";
import nextEnv from "@next/env"; // CommonJS: no named exports in ESM
import { hash } from "@node-rs/argon2";
import postgres from "postgres";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    first: { type: "string" },
    last: { type: "string" },
    password: { type: "string" },
  },
});

const email = values.email?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error(
    "Usage: npm run admin:create -- --email <email> [--first <name> --last <name> --password <password>]",
  );
  process.exit(1);
}

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see .env.example)");
  process.exit(1);
}

const sql = postgres(url, { onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    const [existing] = await tx`SELECT id, is_admin FROM users WHERE email = ${email} FOR UPDATE`;

    if (existing) {
      if (existing.is_admin) {
        console.log(`${email} is already an administrator. Nothing changed.`);
        return;
      }
      await tx`UPDATE users SET is_admin = true, updated_at = now() WHERE id = ${existing.id}`;
      await tx`
        INSERT INTO audit_log (actor_id, entity_type, entity_id, action, before, after)
        VALUES (${existing.id}, 'user', ${existing.id}, 'admin.grant_by_it',
                ${tx.json({ isAdmin: false })}, ${tx.json({ isAdmin: true })})`;
      console.log(`${email} is now an administrator (password unchanged).`);
      return;
    }

    const first = values.first?.trim();
    const last = values.last?.trim();
    if (!first || !last || !values.password) {
      throw new Error("A new account needs --first, --last and --password.");
    }
    const passwordHash = await hash(values.password);
    const [user] = await tx`
      INSERT INTO users (email, first_name, last_name, password_hash, is_admin)
      VALUES (${email}, ${first}, ${last}, ${passwordHash}, true)
      RETURNING id`;
    await tx`
      INSERT INTO audit_log (actor_id, entity_type, entity_id, action, after)
      VALUES (${user.id}, 'user', ${user.id}, 'admin.grant_by_it',
              ${tx.json({ email, firstName: first, lastName: last, isAdmin: true })})`;
    console.log(`Administrator ${first} ${last} <${email}> created.`);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
