import { expect, test } from "@playwright/test";
import { newAccount, signUp } from "./helpers";

// REQ-PROJ-01, REQ-UI-03, REQ-SET-01, REQ-PROJ-03
test("create a project, edit its settings and delete it", async ({ page }) => {
  await signUp(page, newAccount());

  // Create: defaults come from the browser (today, its time zone)
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Time zone")).not.toHaveValue("");
  await expect(dialog.getByLabel("Field activities start date")).not.toHaveValue("");
  await dialog.getByLabel("Client name").fill("ACME Mining");
  await dialog.getByLabel("Project code").fill("P-100");
  await dialog.getByLabel("Date format").click();
  await page.getByRole("option", { name: "MM/DD/YYYY" }).click();
  await dialog.getByRole("button", { name: "Create project" }).click();

  // Lands on the Loop check tab, with the project header and the four tabs
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/loop-check$/);
  await expect(page.getByRole("heading", { name: "ACME Mining" })).toBeVisible();
  await expect(page.getByText("No IO list imported")).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Project" });
  for (const tab of ["Loop check", "IO list", "Reports", "Project settings"]) {
    await expect(tabs.getByRole("link", { name: tab })).toBeVisible();
  }

  // Settings: edit, and the header follows
  await tabs.getByRole("link", { name: "Project settings" }).click();
  await page.getByLabel("Client name").fill("ACME Mining Co.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ACME Mining Co." })).toBeVisible();

  // Delete: the button only works with the exact code
  await page.getByRole("button", { name: "Delete project" }).click();
  const confirm = page.getByRole("dialog");
  const deleteButton = confirm.getByRole("button", { name: "Delete project" });
  await confirm.getByLabel("Type P-100 to confirm").fill("p-100");
  await expect(deleteButton).toBeDisabled();
  await confirm.getByLabel("Type P-100 to confirm").fill("P-100");
  await deleteButton.click();

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("No projects yet.")).toBeVisible();
});

test("a duplicate project code is refused on the field", async ({ page }) => {
  await signUp(page, newAccount());

  for (const attempt of [1, 2]) {
    await page.goto("/?new");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Client name").fill(`Client ${attempt}`);
    await dialog.getByLabel("Project code").fill("DUP-1");
    await dialog.getByRole("button", { name: "Create project" }).click();
    if (attempt === 1) await expect(page).toHaveURL(/\/loop-check$/);
  }

  await expect(page.getByText("A project with this code already exists.")).toBeVisible();
  // The form keeps what was typed
  await expect(page.getByRole("dialog").getByLabel("Client name")).toHaveValue("Client 2");
});

test("unknown projects show a not-found page", async ({ page }) => {
  await signUp(page, newAccount());

  await page.goto("/projects/00000000-0000-4000-8000-000000000000/settings");

  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
});
