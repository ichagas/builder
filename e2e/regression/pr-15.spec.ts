/**
 * PR-15 Present.
 * Capabilities exercised: page loads; create-presentation dialog opens.
 * Not exercised: agent generation, layouts, slide canvas/renderer, notes,
 * thumbnails, images, font scale, PDF export -- generation calls an LLM;
 * the rest are downstream of having a generated presentation. See
 * e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-15 present: loads, create-presentation dialog opens, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-15 Present Project"));
  await page.goto(routes.project.present(project.id));
  await expect(page.getByRole("heading", { name: "Present", exact: true })).toBeVisible();
  await expect(page.getByText("No Presentations Yet")).toBeVisible();

  await page.getByRole("button", { name: "Create Presentation" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Present", exact: true })).toBeVisible();

  await recordAxeBaseline(page, "pr-15", testInfo);
});
