/**
 * PR-11 Repository.
 * Capabilities exercised: page loads; GitHub connect banner is shown; the
 * "create repository" entry point opens.
 * Not exercised: actually creating/linking a repo, prime repo, file tree,
 * Monaco editor, search, stage/unstage, commit, pull/push, PAT management
 * -- all need a real GitHub App installation (D-18). See e2e/README.md
 * coverage notes.
 *
 * `exact: true` on the "Repository" heading match is load-bearing, not
 * decoration: unique()'s project name is "PR-11 Repository Project-<ts>-
 * <rand>", whose sidebar heading contains "Repository" as a substring, so a
 * non-exact match is ambiguous against the page's own "Repository" h1 --
 * flaky depending on which one Playwright's accessible-name search visits
 * first. This was an intermittent flake in the previously-green suite.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-11 repository: loads, shows GitHub connect banner, create-repo dialog opens, reloads", async ({
  page,
}, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-11 Repository Project"));
  await page.goto(routes.project.repository(project.id));
  await expect(page.getByRole("heading", { name: "Repository", exact: true })).toBeVisible();
  await expect(page.getByText("Connect your GitHub account")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();

  await page.getByRole("button", { name: "Add Repository" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Repository", exact: true })).toBeVisible();

  await recordAxeBaseline(page, "pr-11", testInfo);
});
