/**
 * IT tool: reactivates an account an admin removed (e.g. someone who left the
 * company and came back). Memberships and project ownership do not come back:
 * project owners invite the person again.
 *
 *   npm run user:reactivate -- --email ana@company.com
 *
 * Their old password works again; if they forgot it, an admin generates a
 * temporary one (Administration → Users). Uses DATABASE_URL from the .env files.
 */
import { parseArgs } from "node:util";
import nextEnv from "@next/env"; // CommonJS: no named exports in ESM
import postgres from "postgres";

const { values } = parseArgs({ options: { email: { type: "string" } } });
const email = values.email?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run user:reactivate -- --email <email>");
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
    const [user] = await tx`
      SELECT id, deactivated_at FROM users WHERE email = ${email} FOR UPDATE`;
    if (!user) throw new Error(`No account with the email ${email}.`);
    if (!user.deactivated_at) {
      console.log(`${email} is active. Nothing changed.`);
      return;
    }
    await tx`
      UPDATE users SET deactivated_at = NULL, deactivated_by = NULL, updated_at = now()
      WHERE id = ${user.id}`;
    await tx`
      INSERT INTO audit_log (actor_id, entity_type, entity_id, action, before, after)
      VALUES (${user.id}, 'user', ${user.id}, 'user.reactivate_by_it',
              ${tx.json({ deactivatedAt: user.deactivated_at.toISOString() })},
              ${tx.json({ deactivatedAt: null })})`;
    console.log(
      `${email} is active again. They belong to no project yet: owners must invite them.\n` +
        "If they forgot their password, generate a temporary one in Administration → Users.",
    );
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
