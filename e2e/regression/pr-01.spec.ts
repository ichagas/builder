/**
 * PR-01 Projects home (contracts/routes.md §2).
 * Capabilities exercised: list mine; create (standard dialog); reload.
 * Not exercised: clone, delete-with-counts, add shared project, anonymous
 * project warning/save-to-user, activity feed -- see e2e/README.md coverage
 * notes (each needs a second account/session or is a thin variant of create).
 */
import { test, expect, unique, recordAxeBaseline } from "../fixtures";
import { routes } from "../routes";

test("PR-01 projects home: loads, lists, creates, reloads", async ({ page }, testInfo) => {
  await page.goto(routes.projectsHome());
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // main read: the seeded baseline project is listed
  await expect(page.getByText("E2E Smoke Project").first()).toBeVisible();

  // main write: create a new project via the standard dialog
  const name = unique("PR-01 Project");
  await page.getByRole("button", { name: "Create New Project" }).click();
  await page.getByLabel("Project Name *").fill(name);
  await page.getByRole("button", { name: "Create Project", exact: true }).click();

  // Creation always shows a share-link dialog; "Go to Project" lands on
  // the new project's settings page (see EnhancedCreateProjectDialog.tsx).
  await page.getByRole("button", { name: "Go to Project" }).click();
  await expect(page).toHaveURL(routes.project.settingsWithTokenUrlPattern());
  await expect(page.getByRole("heading", { name: "Project Settings" })).toBeVisible();

  // reload restores the page
  await page.reload();
  await expect(page.getByRole("heading", { name: "Project Settings" })).toBeVisible();

  // Back on the dashboard, the new project is now listed.
  await page.goto(routes.projectsHome());
  await expect(page.getByText(name)).toBeVisible();

  await recordAxeBaseline(page, "pr-01", testInfo);
});
