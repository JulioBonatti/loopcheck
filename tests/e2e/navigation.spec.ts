import { expect, type Page, test } from "@playwright/test";
import { newAccount, signUp } from "./helpers";

async function createProject(page: Page, client: string, code: string) {
  await page.goto("/?new");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Client name").fill(client);
  await dialog.getByLabel("Project code").fill(code);
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/loop-check$/);
}

test("the menu shows the project changed last as Recent", async ({ page }) => {
  await signUp(page, newAccount());
  const menu = page.getByRole("button", { name: "Open navigation" });
  const recent = page.getByRole("menuitem", { name: /Alpha|Beta/ });

  // Nothing changed yet: no Recent entry
  await menu.hover();
  await expect(page.getByRole("menuitem", { name: "New project" })).toBeVisible();
  await expect(recent).toHaveCount(0);
  await page.keyboard.press("Escape");

  await createProject(page, "Alpha", "NAV-1");
  await createProject(page, "Beta", "NAV-2");
  await menu.hover();
  await expect(recent).toHaveText(/Beta/);
  await page.keyboard.press("Escape");

  // Editing Alpha's settings makes it the recent one
  await page.goto("/");
  await page.getByRole("link", { name: /Alpha/ }).click();
  await page.getByRole("link", { name: "Project settings" }).click();
  await page.getByLabel("Description").fill("Changed");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await menu.hover();
  await expect(recent).toHaveText(/Alpha/);
  await page.keyboard.press("Escape");

  // Deleted projects never show up
  await page.getByRole("button", { name: "Delete project" }).click();
  await page.getByLabel("Type NAV-1 to confirm").fill("NAV-1");
  await page.getByRole("dialog").getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await menu.hover();
  await expect(recent).toHaveText(/Beta/);
});

test("the account menu leads to My account and App settings", async ({ page }) => {
  await signUp(page, newAccount("Rui", "Costa"));

  const menu = page.getByRole("button", { name: "Open account menu" });
  await expect(menu).toContainText("Rui Costa");
  await menu.hover();
  await page.getByRole("menuitem", { name: "App settings" }).click();
  await expect(page.getByRole("heading", { name: "App settings" })).toBeVisible();

  await menu.hover();
  await page.getByRole("menuitem", { name: "My account" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("the projects list filters by client or code", async ({ page }) => {
  await signUp(page, newAccount());
  await createProject(page, "Vale Mining", "VM-01");
  await createProject(page, "Petro Óleo", "PO-77");
  await page.goto("/");

  const filter = page.getByLabel("Filter projects");
  const cards = page.getByRole("link", { name: /tags|No tags/ });
  await expect(cards).toHaveCount(2);

  await filter.fill("po-7");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Petro Óleo");

  await filter.fill("oleo"); // accents and case do not matter
  await expect(cards).toHaveCount(1);

  await filter.fill("nothing");
  await expect(page.getByText("No projects match")).toBeVisible();
});
