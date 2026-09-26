/**
 * PR-13 Environments (Deploy).
 * Capabilities exercised: page loads; create-deployment entry point opens.
 * Not exercised: deploy/start/stop/restart, logs, env vars, service config,
 * preview token, testing logs -- all need a real Azure Container Apps
 * target. See e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-13 environments: loads, create-deployment dialog opens, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-13 Deploy Project"));
  await page.goto(routes.project.deploy(project.id));
  await expect(page.getByRole("heading", { name: "Deploy", exact: true })).toBeVisible();
  await expect(page.getByText("No cloud deployments yet")).toBeVisible();

  await page.getByRole("button", { name: "Create First Deployment" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Deploy", exact: true })).toBeVisible();

  await recordAxeBaseline(page, "pr-13", testInfo);
});
