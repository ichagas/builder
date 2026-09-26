/**
 * PR-02 Project settings.
 * Capabilities exercised: name/details edit and save; token create (owner);
 * reload.
 * Not exercised: LLM settings persistence beyond the visible selects, roll
 * and delete token, publish to gallery, splash image upload, project delete
 * -- entry points only (see e2e/README.md coverage notes); token roll/delete
 * are thin variants of create already proven safe by the create path.
 */
import { test, expect, unique, recordAxeBaseline, api, defaultOwner } from "../fixtures";
import { routes } from "../routes";

test("PR-02 project settings: loads, edits name, creates a token, reloads", async ({ page }, testInfo) => {
  // Its own project (not the shared seed.projectId): this test renames it,
  // and other specs (PR-01, PR-03, PR-05...) read the seed project's name
  // and would break if it were mutated here.
  const project = await api.createProject(defaultOwner, unique("PR-02 Settings Project"));
  await page.goto(routes.project.settings(project.id));
  await expect(page.getByRole("heading", { name: "Project Settings" })).toBeVisible();

  // The name field starts empty and is hydrated from a `get_project_with_token`
  // fetch that's still in flight right after navigation; a `useEffect` on
  // that query's data re-syncs (and would clobber) the field whenever it
  // resolves. Wait for that initial hydration before typing, or a
  // late-arriving response overwrites our edit straight back to the
  // pre-edit name (a real race in ProjectSettings.tsx, not a flaky test).
  const nameInput = page.getByLabel("Project Name", { exact: true });
  await expect(nameInput).toHaveValue(project.name);

  // main write: rename
  const newName = unique("E2E Renamed Project");
  await nameInput.fill(newName);
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText(/saved|updated/i).first()).toBeVisible();

  // reload restores the page (and the edited name)
  await page.reload();
  await expect(page.getByLabel("Project Name", { exact: true })).toHaveValue(newName);

  // token management (owner-only section): create an access token
  await page.getByRole("button", { name: "Add Token" }).click();
  await page.getByLabel("Label (optional)").fill(unique("qa-token"));
  await page.getByRole("button", { name: "Create Token", exact: true }).click();
  await expect(page.getByText(/token created/i).first()).toBeVisible();

  await recordAxeBaseline(page, "pr-02", testInfo);
});
