/**
 * PR-10 Build agent.
 * Capabilities exercised: page loads (file tree, chat viewer, staging
 * panel shells all render for a project with no build activity yet);
 * reload.
 * Not exercised: agent sessions, prompt editor, progress/status, raw LLM
 * logs, abort, staging diff, commit history -- all require a running agent
 * session (LLM + repo), not available locally. See e2e/README.md coverage
 * notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-10 build: loads, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-10 Build Project"));
  await page.goto(routes.project.build(project.id));
  await expect(page.getByRole("heading", { name: "Build", exact: true })).toBeVisible();
  await expect(page.getByText("No files yet")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Build", exact: true })).toBeVisible();

  await recordAxeBaseline(page, "pr-10", testInfo);
});
