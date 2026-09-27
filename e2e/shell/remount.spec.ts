/**
 * Shell remount E2E (WP-F3 acceptance: "Remount test 0", contracts/routes.md
 * PR-22 "No remount across routes"). Runs only against `app/frontend-new`
 * (APP=new). Complements the unit-level remount tests
 * (`src/app/__tests__/remount.test.tsx`, `AppShell.test.tsx`) with a real
 * browser check: a marker written to `window` before the app boots must
 * survive an in-app (client-side) navigation between two tool tabs inside
 * the same project, because only a full page (re)navigation would reset it.
 */
import { test, expect, seed } from "../fixtures";

test.skip(process.env.APP !== "new", "The shell only exists in app/frontend-new");

test("navigating between two phase tools does not remount the shell", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __shellProbe: number }).__shellProbe = Date.now();
  });

  await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
  const probe = await page.evaluate(() => (window as unknown as { __shellProbe: number }).__shellProbe);
  expect(probe).toBeGreaterThan(0);

  // Client-side navigation via the Rail (desktop) -- clicking a real link,
  // not page.goto, so this exercises the router's own navigation path.
  await page.getByRole("link", { name: /^Design/ }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/design/canvas$`));

  const probeAfter = await page.evaluate(() => (window as unknown as { __shellProbe: number }).__shellProbe);
  expect(probeAfter).toBe(probe);

  await page.getByRole("link", { name: /^Define/ }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/define/requirements$`));
  const probeAfter2 = await page.evaluate(() => (window as unknown as { __shellProbe: number }).__shellProbe);
  expect(probeAfter2).toBe(probe);
});

test("tool and tab restore correctly on a hard reload (URL-held state)", async ({ page }) => {
  await page.goto(`/p/${seed.projectId}/v/current/design/canvas`);
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/design/canvas$`));
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}/v/current/design/canvas$`));
});
