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

test("the projects menu follows creations and deletions", async ({ page }) => {
  await signUp(page, newAccount());
  await createProject(page, "Alpha", "NAV-1");

  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.hover();
  await expect(page.getByRole("menuitem", { name: /Alpha/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Project Settings" }).click();
  await page.getByRole("button", { name: "Delete project" }).click();
  await page.getByLabel("Type NAV-1 to confirm").fill("NAV-1");
  await page.getByRole("dialog").getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByText("No projects yet.")).toBeVisible();

  await menu.hover();
  await expect(page.getByRole("menuitem", { name: "New project" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Alpha/ })).toHaveCount(0);
});

test("the account menu leads to My account and App Settings", async ({ page }) => {
  await signUp(page, newAccount("Rui", "Costa"));

  const menu = page.getByRole("button", { name: "Open account menu" });
  await expect(menu).toContainText("Rui Costa");
  await menu.hover();
  await page.getByRole("menuitem", { name: "App Settings" }).click();
  await expect(page.getByRole("heading", { name: "App Settings" })).toBeVisible();

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
