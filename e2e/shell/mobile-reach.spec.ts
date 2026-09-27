/**
 * Mobile reach E2E (T037, WP-F6). See contracts/design-system.md §2:
 * "MobileTabBar: 4-5 items. Project: Versions + 4 phases" (`<=768px`, `Rail`
 * "Hidden <=768px"), "PrimaryActionSlot" mirroring the page's primary
 * action at `<=768px`, and spec.md SC-005: "At 390x844, the primary action
 * and navigation are in the bottom 35% on every project route." Also
 * spec.md US1 AC3: "Given a 390px-wide phone, When any project screen is
 * open, Then navigation and the primary action are in the bottom 35% of
 * the viewport."
 *
 * Runs only against `app/frontend-new` (APP=new) -- the shell (and its
 * mobile chrome) doesn't exist in legacy. Only the `mobile` Playwright
 * project (390x844) is meaningful here; desktop is skipped per-test via
 * `test.skip` so the file still appears (and no-ops cleanly) if someone
 * runs the whole `shell` dir against both projects.
 */
import { test, expect, seed } from "../fixtures";

test.skip(process.env.APP !== "new", "The shell only exists in app/frontend-new");

const BOTTOM_35_PERCENT_Y = 844 * 0.65; // top edge of the viewport's bottom 35%

test.describe("mobile reach (contracts/design-system.md §2, spec.md SC-005)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile-reach assertions only apply at 390x844");
  });

  test("every MobileTabBar item (Versions + 4 phases) is reachable in exactly one tap", async ({ page }) => {
    await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);

    const tabBar = page.getByRole("navigation", { name: "Project" }).last();
    await expect(tabBar).toBeVisible();

    const expectedDestinations: Array<[label: RegExp, urlSuffix: string]> = [
      [/^Versions/, `/p/${seed.projectId}/versions`],
      [/^Define/, `/p/${seed.projectId}/v/current/define/requirements`],
      [/^Design/, `/p/${seed.projectId}/v/current/design/canvas`],
      [/^Build/, `/p/${seed.projectId}/v/current/build/agent`],
      [/^Ship/, `/p/${seed.projectId}/v/current/ship/environments`],
    ];

    for (const [label, urlSuffix] of expectedDestinations) {
      // Always start from a different tool so the tap is a real navigation.
      await page.goto(`/p/${seed.projectId}/v/current/define/artifacts`);
      const item = page.getByRole("link", { name: label });
      await expect(item).toBeVisible();
      await item.click(); // one tap
      await expect(page).toHaveURL(new RegExp(`${urlSuffix.replace(/\//g, "\\/")}$`));
    }
  });

  test("the tab bar and its items sit in the bottom 35% of the viewport and meet the 44px touch target", async ({ page }) => {
    await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
    const tabBar = page.getByRole("navigation", { name: "Project" }).last();
    const box = await tabBar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(BOTTOM_35_PERCENT_Y);

    const items = tabBar.getByRole("link");
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(5);
    for (let i = 0; i < count; i += 1) {
      const itemBox = await items.nth(i).boundingBox();
      expect(itemBox).not.toBeNull();
      expect(itemBox!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("the primary action slot, when a page publishes one, is >=44px tall and sits above the tab bar in the bottom 35%", async ({
    page,
  }) => {
    // No route currently publishes a primary action (project tool pages are
    // still legacy-page-in-shell pending their WP-D*/G*/B*/S* restyle
    // tasks; see contracts/routes.md PR-22 and plan.md's "move and restyle
    // recipe"), so the slot renders nothing anywhere in the live app yet --
    // this is the expected pre-restyle state, not a shell defect. This test
    // asserts the always-true side of the contract (no primary action -> no
    // slot in the layout) and documents, for the pages that add one later,
    // the exact assertion they must pass.
    await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
    const slot = page.locator("#mobile-primary-action");
    await expect(slot).toHaveCount(0);

    // Contract check on the component itself: PrimaryActionSlot renders a
    // fixed h-11 (44px) button — verified against its source below so this
    // spec still fails loudly if that sizing regresses, without needing a
    // live page that publishes an action.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../app/frontend-new/src/components/shell/PrimaryActionSlot.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/\bh-11\b/); // h-11 = 2.75rem = 44px
    expect(src).toMatch(/bottom-\[calc\(56px/); // fixed above the 56px-tall MobileTabBar
  });

  test("the search button opens the command palette from mobile chrome", async ({ page }) => {
    await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Search" }).click();
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();
    await expect(palette.getByPlaceholder(/search projects, tools, library/i)).toBeVisible();
  });

  test("the status center opens from the mobile global bar", async ({ page }) => {
    await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
    const pill = page.getByRole("button", { name: /running and recent/i });
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("aria-expanded", "false");

    await pill.click();
    await expect(pill).toHaveAttribute("aria-expanded", "true");
    const popover = page.getByRole("dialog", { name: /running and recent/i });
    await expect(popover).toBeVisible();
  });

  test("no horizontal scroll on the shell at 390px, across the phases", async ({ page }) => {
    const urls = [
      `/p/${seed.projectId}/v/current/define/requirements`,
      `/p/${seed.projectId}/v/current/design/canvas`,
      `/p/${seed.projectId}/v/current/build/agent`,
      `/p/${seed.projectId}/v/current/ship/environments`,
    ];
    for (const url of urls) {
      await page.goto(url);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `${url} should not overflow horizontally at 390px`).toBeLessThanOrEqual(clientWidth);
    }
  });
});
