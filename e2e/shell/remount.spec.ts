/**
 * Shell remount E2E (WP-F3 acceptance: "Remount test 0", contracts/routes.md
 * PR-22 "No remount across routes"). Runs only against `app/frontend-new`
 * (APP=new). Complements the unit-level remount tests
 * (`src/app/__tests__/remount.test.tsx`, `AppShell.test.tsx`) with a real
 * browser check: a marker written to `window` before the app boots must
 * survive an in-app (client-side) navigation between two tool tabs inside
 * the same project, because only a full page (re)navigation would reset it.
 *
 * Two variants of the navigation check, one per chrome: the Rail is
 * `<=768px`-hidden per contracts/design-system.md §2 (MobileTabBar takes
 * over there instead), so each variant is skipped on the Playwright project
 * where its chrome doesn't render -- mirroring the `testInfo.project.name`
 * guard used by axe-shell.spec.ts and mobile-reach.spec.ts.
 */
import { test, expect, seed } from "../fixtures";

test.skip(process.env.APP !== "new", "The shell only exists in app/frontend-new");

async function armShellProbe(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as { __shellProbe: number }).__shellProbe = Date.now();
  });
}

async function readShellProbe(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { __shellProbe: number }).__shellProbe);
}

test("navigating between two phase tools via the Rail does not remount the shell", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Rail is hidden <=768px; see MobileTabBar variant below");

  await armShellProbe(page);

  await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
  const probe = await readShellProbe(page);
  expect(probe).toBeGreaterThan(0);

  // Client-side navigation via the Rail (desktop) -- clicking a real link,
  // not page.goto, so this exercises the router's own navigation path.
  await page.getByRole("link", { name: /^Design/ }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/design/canvas$`));

  const probeAfter = await readShellProbe(page);
  expect(probeAfter).toBe(probe);

  await page.getByRole("link", { name: /^Define/ }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/define/requirements$`));
  const probeAfter2 = await readShellProbe(page);
  expect(probeAfter2).toBe(probe);
});

test("navigating between two phase tools via the MobileTabBar does not remount the shell", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "MobileTabBar only renders <=768px; see Rail variant above");

  await armShellProbe(page);

  await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
  const probe = await readShellProbe(page);
  expect(probe).toBeGreaterThan(0);

  const tabBar = page.getByRole("navigation", { name: "Project" }).last();
  await expect(tabBar).toBeVisible();

  // Client-side navigation via the MobileTabBar -- clicking a real link, not
  // page.goto, so this exercises the router's own navigation path.
  await tabBar.getByRole("link", { name: /^Design/ }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/design/canvas$`));

  const probeAfter = await readShellProbe(page);
  expect(probeAfter).toBe(probe);

  await tabBar.getByRole("link", { name: /^Define/ }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/define/requirements$`));
  const probeAfter2 = await readShellProbe(page);
  expect(probeAfter2).toBe(probe);
});

test("tool and tab restore correctly on a hard reload (URL-held state)", async ({ page }) => {
  await page.goto(`/p/${seed.projectId}/v/current/design/canvas`);
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/design/canvas$`));
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/design/canvas$`));
});
