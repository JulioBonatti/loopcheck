import { expect, test } from "@playwright/test";
import { newAccount, signIn, signUp, withDb } from "./helpers";

test("the header menu opens on hover and leads to My account", async ({ page }) => {
  await signUp(page, newAccount());

  await page.getByRole("button", { name: "Open navigation" }).hover();
  await page.getByRole("menuitem", { name: "My account" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("Projects you own")).toBeVisible();
});

// REQ-AUTH-06
test("change password, then sign in with the new one", async ({ page }) => {
  const account = newAccount();
  await signUp(page, account);
  await page.goto("/account");

  await page.getByLabel("Current password").fill(account.password);
  await page.getByLabel("New password", { exact: true }).fill("new-secret");
  await page.getByLabel("Confirm new password").fill("new-secret");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  await page.getByRole("button", { name: "Open navigation" }).hover();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await signIn(page, account.email, "new-secret");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

// REQ-AUTH-07 (the admin side comes in step 8): set the flag directly
test("a forced password change blocks the app until done", async ({ page }) => {
  const account = newAccount();
  await signUp(page, account);
  await withDb(
    (sql) => sql`update users set must_change_password = true where email = ${account.email}`,
  );

  await page.goto("/account");
  await expect(page).toHaveURL(/\/change-password$/);

  await page.getByLabel("Temporary password").fill(account.password);
  await page.getByLabel("New password", { exact: true }).fill("new-secret");
  await page.getByLabel("Confirm new password").fill("new-secret");
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.goto("/change-password");
  await expect(page).toHaveURL(/\/account$/);
});
