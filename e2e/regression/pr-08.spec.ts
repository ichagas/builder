/**
 * PR-08 Canvas.
 * Capabilities exercised: page loads with the node palette and an empty
 * ReactFlow canvas; reload.
 * Not exercised: nodes/edges/layers/lasso/zones/notes/labels, properties
 * panels, AI architect/critic, agent flow, iterative enhancement, change
 * heatmap/log, infographic -- adding a node is drag-and-drop from the
 * palette (or a touch-only click path neither Playwright project emulates);
 * simulating that reliably was out of scope here. See e2e/README.md
 * coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-08 canvas: loads, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-08 Canvas Project"));
  await page.goto(routes.project.canvas(project.id));
  await expect(page.getByText("Canvas Palette")).toBeVisible();
  await expect(page.locator(".react-flow")).toBeVisible();

  await page.reload();
  await expect(page.locator(".react-flow")).toBeVisible();

  await recordAxeBaseline(page, "pr-08", testInfo);
});
