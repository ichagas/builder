/**
 * PR-04 Requirements.
 * Capabilities exercised: tree read; add (create) a root-level requirement;
 * reload.
 * Not exercised: AI decompose (calls an LLM), source upload, per-node
 * expand-with-AI, link-standards dialog submit (opens fine, not completed)
 * -- see e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, seed, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-04 requirements: loads, lists, adds an epic, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-04 Requirements Project"));
  await page.goto(routes.project.requirements(project.id));
  await expect(page.getByRole("heading", { name: "Requirements", exact: true })).toBeVisible();
  await expect(page.getByText("No requirements yet")).toBeVisible();

  // main write: add a root requirement
  await page.getByRole("button", { name: "Add First Epic" }).click();
  await expect(page.getByText("First Epic")).toBeVisible();

  await page.reload();
  await expect(page.getByText("First Epic")).toBeVisible();

  await recordAxeBaseline(page, "pr-04", testInfo);
});

test("PR-04 requirements: main read on the seeded project", async ({ page }) => {
  await page.goto(routes.project.requirements(seed.projectId));
  await expect(page.getByText("E2E seeded requirement")).toBeVisible();
});
