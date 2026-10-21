import { type Browser, expect, type Page, test } from "@playwright/test";
import { newAccount, signIn, signUp, type TestAccount, withDb } from "./helpers";

async function newUser(browser: Browser, first: string, last: string, { admin = false } = {}) {
  const page = await (await browser.newContext()).newPage();
  const account = newAccount(first, last);
  await signUp(page, account);
  // The first account of a run becomes admin; tests run in parallel, so set it explicitly.
  await withDb((sql) => sql`update users set is_admin = ${admin} where email = ${account.email}`);
  return { page, account };
}

async function createProject(page: Page, client: string): Promise<string> {
  const code = `ADM-${crypto.randomUUID().slice(0, 6)}`;
  await page.goto("/?new");
  await page.getByLabel("Client name").fill(client);
  await page.getByLabel("Project code").fill(code);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/loop-check$/);
  return code;
}

async function deleteProject(page: Page, code: string) {
  await page.getByRole("link", { name: "Project settings" }).click();
  await page.getByRole("button", { name: "Delete project" }).click();
  await page.getByLabel(`Type ${code} to confirm`).fill(code);
  await page.getByRole("dialog").getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

function card(page: Page, name: string) {
  return page.getByRole("group", { name });
}

// REQ-AUTH-07, REQ-ACC-04
test("an admin gives a temporary password and the user must replace it", async ({ browser }) => {
  const admin = await newUser(browser, "Ada", "Admin", { admin: true });
  const user = await newUser(browser, "Uri", "User");

  await admin.page.goto("/");
  await admin.page.getByRole("button", { name: "Open account menu" }).hover();
  await admin.page.getByRole("menuitem", { name: "Administration" }).click();
  await admin.page.getByLabel("Filter users").fill(user.account.email);
  await card(admin.page, "Uri User")
    .getByRole("button", { name: "Generate temporary password" })
    .click();
  await admin.page.getByRole("button", { name: "Generate password" }).click();
  const password =
    (await admin.page.getByLabel("Temporary password", { exact: true }).textContent()) ?? "";
  expect(password).toMatch(/^\S{12}$/);

  // The user was signed out everywhere
  await user.page.goto("/");
  await expect(user.page).toHaveURL(/\/sign-in$/);

  await signIn(user.page, user.account.email, password);
  await expect(user.page).toHaveURL(/\/change-password$/);
  await user.page.getByLabel("Temporary password").fill(password);
  await user.page.getByLabel("New password", { exact: true }).fill("brand-new");
  await user.page.getByLabel("Confirm new password").fill("brand-new");
  await user.page.getByRole("button", { name: "Change password" }).click();
  await expect(user.page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

// Delivery 1 validation, item 5 (REQ-PROJ-03, REQ-PROJ-04)
test("an admin restores a deleted project and purges another", async ({ browser }) => {
  const admin = await newUser(browser, "Ada", "Admin", { admin: true });
  const owner = await newUser(browser, "Otto", "Owner");

  const kept = await createProject(owner.page, "Restore Me");
  await deleteProject(owner.page, kept);
  const gone = await createProject(owner.page, "Purge Me");
  await deleteProject(owner.page, gone);

  await admin.page.goto("/admin/trash");
  await card(admin.page, `Restore Me ${kept}`).getByRole("button", { name: "Restore" }).click();
  await expect(admin.page.getByText(`Restore Me ${kept} was restored.`)).toBeVisible();

  await card(admin.page, `Purge Me ${gone}`)
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await admin.page.getByLabel(`Type ${gone} to confirm`).fill(gone);
  await admin.page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect(card(admin.page, `Purge Me ${gone}`)).toHaveCount(0);

  await owner.page.goto("/");
  await expect(owner.page.getByRole("link", { name: /Restore Me/ })).toBeVisible();
  await expect(owner.page.getByRole("link", { name: /Purge Me/ })).toHaveCount(0);
});

// REQ-PROJ-05
test("an admin transfers a project's ownership", async ({ browser }) => {
  const admin = await newUser(browser, "Ada", "Admin", { admin: true });
  const owner = await newUser(browser, "Otto", "Owner");
  const heir = await newUser(browser, "Hana", "Heir");
  const code = await createProject(owner.page, "Handover");

  await admin.page.goto("/admin/projects");
  await card(admin.page, `Handover ${code}`)
    .getByRole("button", { name: "Transfer ownership" })
    .click();
  await admin.page.getByLabel("New owner").click();
  await admin.page.getByRole("option", { name: new RegExp(heir.account.email) }).click();
  await admin.page.getByRole("dialog").getByRole("button", { name: "Transfer ownership" }).click();
  await expect(card(admin.page, `Handover ${code}`)).toContainText("Hana Heir");

  await heir.page.goto("/");
  await expect(heir.page.getByRole("link", { name: /Handover/ })).toContainText("Owner");
  await owner.page.goto("/");
  await expect(owner.page.getByRole("link", { name: /Handover/ })).toContainText("Member");
});

test("non-admins do not see Administration", async ({ browser }) => {
  const user: { page: Page; account: TestAccount } = await newUser(browser, "Nia", "Normal");

  await user.page.getByRole("button", { name: "Open account menu" }).hover();
  await expect(user.page.getByRole("menuitem", { name: "My account" })).toBeVisible();
  await expect(user.page.getByRole("menuitem", { name: "Administration" })).toHaveCount(0);

  await user.page.goto("/admin");
  await expect(user.page.getByText("This page could not be found.")).toBeVisible();
});
