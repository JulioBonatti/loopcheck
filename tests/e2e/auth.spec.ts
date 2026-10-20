import { expect, test } from "@playwright/test";

// REQ-AUTH-01, 02, 04: the whole flow through a real browser.
test("sign up, sign out and sign in again", async ({ page }) => {
  const email = `ana.${Date.now()}@example.com`;

  // Protected pages send visitors to sign in
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);

  // Sign up → signed in on the projects page
  await page.getByRole("link", { name: "Sign up" }).click();
  await page.getByLabel("First name").fill("Ana");
  await page.getByLabel("Last name").fill("Lima");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("Ana Lima")).toBeVisible();

  // Sign out → protected pages are closed again
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);

  // Wrong password: generic message, e-mail kept in the form
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(email.toUpperCase());

  // Right password, e-mail in another case
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  // Signed in: the sign-in page sends back to the app
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});
