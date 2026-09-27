/**
 * PR-09 Specifications.
 * Capabilities exercised: page loads; content-selection entry point opens.
 * Not exercised: generate (LLM), saved specs list, version history, set
 * latest, download options -- generation calls an LLM; the rest are thin
 * reads of whatever generate produces. See e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-09 specifications: loads, content-selection dialog opens, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-09 Specifications Project"));
  await page.goto(routes.project.specifications(project.id));
  await expect(page.getByRole("heading", { name: "Project Specifications" })).toBeVisible();
  await expect(page.getByText("Select Agents")).toBeVisible();

  await page.getByRole("button", { name: "Select Content" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Project Specifications" })).toBeVisible();

  await recordAxeBaseline(page, "pr-09", testInfo);
});
