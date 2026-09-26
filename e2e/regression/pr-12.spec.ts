/**
 * PR-12 Database.
 * Capabilities exercised: page loads; project-database and external-
 * connection create dialogs open.
 * Not exercised: actually provisioning a database, schema tree, SQL editor,
 * saved queries, results, table structure, import wizard, database agent,
 * migrations -- provisioning needs a real target (Azure/genapps) beyond
 * opening the dialog; the rest are downstream of having one. See
 * e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-12 database: loads, create-database dialog opens, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-12 Database Project"));
  await page.goto(routes.project.database(project.id));
  await expect(page.getByRole("heading", { name: "Database", exact: true })).toBeVisible();
  await expect(page.getByText("No project databases yet")).toBeVisible();

  await page.getByRole("button", { name: "Create First Database" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Database", exact: true })).toBeVisible();

  await recordAxeBaseline(page, "pr-12", testInfo);
});
