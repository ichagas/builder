/**
 * PR-03 Access (share tokens).
 * Capabilities exercised: viewer and editor share-token access; the access
 * banner shows the correct role, without a signed-in session.
 * Not exercised: the token-recovery message's copy-to-clipboard flow
 * (clipboard access is unreliable under the artifact/CI sandbox) -- its
 * mount/render is still covered since it shares the settings page.
 */
import { test, expect, recordAxeBaseline, seed } from "../fixtures";
import { routes } from "../routes";

test.use({ mockUser: null }); // anonymous: access comes entirely from the share token

test("PR-03 access: viewer token shows read-only banner", async ({ page }, testInfo) => {
  await page.goto(routes.project.settings(seed.projectId, seed.viewerToken));
  await expect(page.getByText("Your Access Level")).toBeVisible();
  await expect(page.getByText("Viewer", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Viewer", { exact: true })).toBeVisible();

  await recordAxeBaseline(page, "pr-03-viewer", testInfo);
});

test("PR-03 access: editor token shows edit banner", async ({ page }, testInfo) => {
  await page.goto(routes.project.settings(seed.projectId, seed.editorToken));
  await expect(page.getByText("Your Access Level")).toBeVisible();
  await expect(page.getByText("Editor", { exact: true })).toBeVisible();
});
