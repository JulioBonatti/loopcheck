import { type Browser, expect, type Page, test } from "@playwright/test";
import { newAccount, signUp } from "./helpers";

async function newUser(browser: Browser, first: string, last: string) {
  const page = await (await browser.newContext()).newPage();
  const account = newAccount(first, last);
  await signUp(page, account);
  return { page, account };
}

async function openProjectSettings(page: Page, projectUrl: string) {
  await page.goto(`${projectUrl}/settings`);
  await expect(page.getByText("Members", { exact: true })).toBeVisible();
}

// REQ-MEM-01…05, REQ-SET-07, REQ-ACC-02, REQ-PERM-01/02
test("invite, accept, change role and remove a member", async ({ browser }) => {
  const owner = await newUser(browser, "Olga", "Owner");
  const guest = await newUser(browser, "Gil", "Guest");

  // The owner creates a project and invites the guest as member
  const code = `TEAM-${crypto.randomUUID().slice(0, 6)}`;
  await owner.page.goto("/?new");
  await owner.page.getByLabel("Client name").fill("Team Client");
  await owner.page.getByLabel("Project code").fill(code);
  await owner.page.getByRole("button", { name: "Create project" }).click();
  await expect(owner.page).toHaveURL(/\/loop-check$/);
  const projectUrl = owner.page.url().replace(/\/loop-check$/, "");

  await openProjectSettings(owner.page, projectUrl);
  await owner.page.getByRole("button", { name: "Invite by email" }).click();
  await owner.page.getByRole("dialog").getByLabel("Email").fill(guest.account.email);
  await owner.page.getByRole("button", { name: "Send invitation" }).click();
  await expect(
    owner.page.getByRole("group", { name: `Invitation to ${guest.account.email}` }),
  ).toBeVisible();

  // The guest sees the counters, follows the Invitations button and accepts
  await guest.page.goto("/");
  await expect(guest.page.getByLabel("1 pending invitations").first()).toBeVisible();
  await guest.page.getByRole("link", { name: /Invitations/ }).click();
  await expect(guest.page).toHaveURL(/\/account#invitations$/);
  await guest.page
    .getByRole("listitem", { name: `Invitation to Team Client ${code}` })
    .getByRole("button", { name: "Accept" })
    .click();
  await expect(guest.page.getByText("No pending invitations.")).toBeVisible();
  await guest.page.goto("/");
  await expect(guest.page.getByRole("link", { name: /Team Client/ })).toBeVisible();

  // As member, the guest sees the members but no controls
  await openProjectSettings(guest.page, projectUrl);
  await expect(guest.page.getByText("Only the project owner can invite")).toBeVisible();
  await expect(guest.page.getByRole("button", { name: "Invite by email" })).toHaveCount(0);

  // The owner filters the cards and turns the guest into a viewer
  await owner.page.reload();
  const filter = owner.page.getByLabel("Filter members");
  await filter.fill("gil");
  await expect(owner.page.getByRole("group", { name: "Olga Owner" })).toHaveCount(0);
  await owner.page.getByLabel("Role of Gil Guest").click();
  await owner.page.getByRole("option", { name: "Viewer" }).click();
  await expect(owner.page.getByText("Gil Guest is now viewer.")).toBeVisible();

  // Viewers do not see Project settings
  await guest.page.goto(`${projectUrl}/loop-check`);
  const tabs = guest.page.getByRole("navigation", { name: "Project" });
  await expect(tabs.getByRole("link", { name: "Loop check" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Project settings" })).toHaveCount(0);

  // The owner removes the guest, who loses the project
  await owner.page
    .getByRole("group", { name: "Gil Guest" })
    .getByRole("button", { name: "Remove" })
    .click();
  await owner.page.getByRole("button", { name: "Remove member" }).click();
  await expect(owner.page.getByText("Gil Guest was removed.")).toBeVisible();

  await guest.page.goto("/");
  await expect(guest.page.getByText("No projects yet.")).toBeVisible();
});
