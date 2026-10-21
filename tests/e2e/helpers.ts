import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "./env";

export type TestAccount = { firstName: string; lastName: string; email: string; password: string };

/** A fresh account; random e-mails, since test files run in parallel workers. */
export function newAccount(firstName = "Ana", lastName = "Lima"): TestAccount {
  return {
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${crypto.randomUUID().slice(0, 12)}@example.com`,
    password: "secret",
  };
}

/** Signs up through the UI and waits for the projects page. */
export async function signUp(page: Page, account: TestAccount) {
  await page.goto("/sign-up");
  await page.getByLabel("First name").fill(account.firstName);
  await page.getByLabel("Last name").fill(account.lastName);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Confirm password").fill(account.password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Direct access to the E2E database, for state the UI cannot create yet. */
export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DATABASE_URL, { onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}
