import { type Browser, expect, type Page, test } from "@playwright/test";
import { newAccount, signUp } from "./helpers";

async function projectWithOwner(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  await signUp(page, newAccount("Sam", "Settings"));
  await page.goto("/?new");
  await page.getByLabel("Client name").fill("Settings Co");
  await page.getByLabel("Project code").fill(`SET-${crypto.randomUUID().slice(0, 6)}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/loop-check$/);
  return { page, projectUrl: page.url().replace(/\/loop-check$/, "") };
}

function settingsTab(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Project settings" }).getByRole("link", { name });
}

function rowLabels(page: Page) {
  return page.getByRole("group", { name: /^Column / }).getByRole("textbox");
}

// REQ-SET-03
test("edit columns: rename, reorder by keyboard, add, primary grouping", async ({ browser }) => {
  const { page, projectUrl } = await projectWithOwner(browser);
  await page.goto(`${projectUrl}/settings`);
  await settingsTab(page, "Columns").click();

  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();

  await page.getByLabel("Label of Loop").fill("Loop #");
  await expect(save).toBeEnabled();

  // Move "P&ID" above "Loop #" with the keyboard
  const pid = page.getByRole("group", { name: "Column P&ID" });
  // dnd-kit measures the rows between key presses, as a person's pace allows
  await pid.getByRole("button", { name: "Drag to reorder" }).focus();
  for (const key of ["Space", "ArrowUp", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expect(rowLabels(page).nth(3)).toHaveValue("P&ID");

  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Label of new column").fill("Equipment");
  await page.getByLabel("Groupable for Equipment").click();
  await page.getByLabel("Primary grouping (Area)").click();
  await page.getByRole("option", { name: "Equipment" }).click();
  // Tag stays required, whatever happens
  await expect(page.getByLabel("Required for Tag")).toBeDisabled();

  await save.click();
  await expect(page.getByText("Columns saved.")).toBeVisible();
  await expect(save).toBeDisabled();

  await page.reload();
  await expect(rowLabels(page).nth(3)).toHaveValue("P&ID");
  await expect(rowLabels(page).nth(4)).toHaveValue("Loop #");
  await expect(rowLabels(page).last()).toHaveValue("Equipment");
  await expect(page.getByLabel("Primary grouping (Area)")).toHaveText(/Equipment/);
});

// Rule 5: a save based on stale data is refused, not applied silently
test("two people saving the same section: the second is told to reload", async ({ browser }) => {
  const { page, projectUrl } = await projectWithOwner(browser);
  const other = await page.context().newPage();
  await page.goto(`${projectUrl}/settings/issue-types`);
  await other.goto(`${projectUrl}/settings/issue-types`);

  await page.getByLabel("Name of Wiring").fill("Cabling");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Issue types saved.")).toBeVisible();

  await other.getByLabel("Name of Logic").fill("Programming");
  await other.getByRole("button", { name: "Save", exact: true }).click();
  await expect(other.getByText("Someone else changed these settings meanwhile.")).toBeVisible();
});

// REQ-SET-04, REQ-SET-05, REQ-SET-06
test("issue types, presets and test procedures", async ({ browser }) => {
  const { page, projectUrl } = await projectWithOwner(browser);
  const save = page.getByRole("button", { name: "Save", exact: true });

  await page.goto(`${projectUrl}/settings/issue-types`);
  await page.getByRole("button", { name: "Add issue type" }).click();
  await page.getByLabel("Name of new type").fill("Mechanical");
  await page
    .getByRole("group", { name: "Issue type Other" })
    .getByRole("button", { name: "Archive" })
    .click();
  await save.click();
  await expect(page.getByText("Issue types saved.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Issue type Other" })).toContainText("Archived");

  await settingsTab(page, "Presets").click();
  await page.getByRole("button", { name: "Add preset" }).click();
  await page.getByLabel("Type of preset 1").click();
  await expect(page.getByRole("option", { name: /Other/ })).toHaveCount(0); // archived
  await page.getByRole("option", { name: "Mechanical" }).click();
  await page.getByLabel("Text of preset 1").fill("Valve stuck");
  await save.click();
  await expect(page.getByText("Presets saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Text of preset 1")).toHaveValue("Valve stuck");

  await settingsTab(page, "Test procedures").click();
  await expect(
    page.getByText("The fields appear here once the IO list is imported."),
  ).toBeVisible();
});
