/**
 * Axe on the shell (T037, WP-F6). See spec.md's definition of done for
 * accessibility: "axe shows no serious or critical issues" per-page
 * (spec.md US1 Independent Test), and the harder shell-specific bar noted
 * in agents.md/tasks.md for the shell chrome itself: zero violations, not
 * just zero serious/critical (unlike `recordAxeBaseline()` in fixtures.ts,
 * which only records legacy's serious+critical counts as a *page-content*
 * baseline -- see e2e/README.md "Coverage notes"). This spec is scoped to
 * shell landmarks only (header/rail/tab bar/dialogs), not page content, by
 * excluding `#page` (the `<main>` that wraps whatever route is mounted --
 * see AppShell.tsx) from every axe run: legacy-page-in-shell content isn't
 * this work package's responsibility (see contracts/routes.md PR-22 vs.
 * PR-01..PR-21), and violations inside it would drown out shell-only ones.
 *
 * Runs only against `app/frontend-new` (APP=new) -- the shell doesn't exist
 * in legacy. Covers 1440 and 390 (via the `desktop`/`mobile` Playwright
 * projects), light and dark (via next-themes' `theme` localStorage key,
 * set before the app boots -- see ThemeProvider.tsx; no in-shell theme
 * toggle is wired up yet, so this is the only way to force a theme here),
 * and: projects home chrome, project chrome with the rail expanded
 * (default) and collapsed (desktop only -- the rail is hidden <=768px per
 * contracts/design-system.md §2, so "collapsed" doesn't apply on mobile),
 * the command palette open, the status center open, and the mobile tab bar
 * (mobile viewport only).
 *
 * Scoping: `.include(SHELL_LANDMARK_SELECTORS)` rather than
 * `.exclude("#page")` -- excluding the routed page content still leaves
 * axe's whole-document "best practice" rules (`page-has-heading-one`,
 * `region`) evaluating the *entire* document, which then fail on shell
 * pages whose only `<h1>`/landmark-wrapped content lives inside the
 * excluded `#page` (a false shell "violation" that's really about the
 * legacy page inside it, out of scope here — see file header). Including
 * only the shell chrome selectors keeps axe from ever looking at
 * document-level completeness at all, so a legacy page's missing `<h1>`
 * can't leak into the shell's own zero-violations bar.
 */
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, seed } from "../fixtures";

type Theme = "light" | "dark";

/** Forces next-themes' theme before the app's first script runs (ThemeProvider.tsx: storageKey defaults to "theme"). */
async function setTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem("theme", t);
    } catch {
      // ignore
    }
  }, theme);
}

/**
 * Shell chrome landmarks (GlobalBar's <header>, Rail/MobileTabBar's
 * <nav aria-label="Project">, ProjectLayout's TimelineStrip wrapped by
 * AppShell in <nav aria-label="Versions"> (T024, WP-F3b), and any open
 * Radix dialog — CommandPalette, StatusCenter's popover) — see file header
 * for why this is `.include()`, not `.exclude("#page")`.
 */
const SHELL_LANDMARK_SELECTORS = ["header", 'nav[aria-label="Project"]', 'nav[aria-label="Versions"]', '[role="dialog"]'];

/**
 * Runs axe scoped to shell chrome only — see SHELL_LANDMARK_SELECTORS.
 * axe-core's `include` throws ("No elements found for include") if any
 * given selector currently matches nothing (e.g. no dialog open, or the
 * root layout with no Rail/MobileTabBar), so only the selectors present in
 * the DOM right now are passed.
 */
async function axeOnShell(page: Page) {
  // The shell always renders a <header> (GlobalBar) once mounted; wait for
  // it so `present` below isn't computed against a still-loading page
  // (a race, not a real "no shell chrome" state).
  await page.locator("header").first().waitFor();
  const present = await page.evaluate(
    (selectors) => selectors.filter((s) => document.querySelector(s) !== null),
    SHELL_LANDMARK_SELECTORS,
  );
  return new AxeBuilder({ page }).include(present).analyze();
}

function describeViolations(results: Awaited<ReturnType<typeof axeOnShell>>, theme: Theme, viewport: string) {
  return results.violations
    .map((v) => `[${theme}/${viewport}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    .join("\n");
}

async function expectShellClean(page: Page, theme: Theme, viewport: string) {
  const results = await axeOnShell(page);
  expect(results.violations, describeViolations(results, theme, viewport)).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`shell axe -- ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme);
    });

    test("projects home chrome", async ({ page }, testInfo) => {
      await page.goto("/projects");
      await expectShellClean(page, theme, testInfo.project.name);
    });

    test("project chrome (rail expanded on desktop, mobile tab bar on mobile)", async ({ page }, testInfo) => {
      await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
      await expectShellClean(page, theme, testInfo.project.name);
    });

    test("project chrome with the rail collapsed", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Rail is hidden <=768px; collapse only applies on desktop");
      await page.addInitScript(() => {
        try {
          window.localStorage.setItem("pronghorn.ui.rail.collapsed", "1");
        } catch {
          // ignore
        }
      });
      await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
      const nav = page.getByRole("navigation", { name: "Project" });
      await expect(nav.first()).toHaveClass(/w-\[76px\]/);
      await expectShellClean(page, theme, testInfo.project.name);
    });

    test("command palette open", async ({ page }, testInfo) => {
      await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectShellClean(page, theme, testInfo.project.name);
    });

    test("status center open", async ({ page }, testInfo) => {
      await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
      await page.getByRole("button", { name: /running and recent/i }).click();
      await expect(page.getByRole("dialog", { name: /running and recent/i })).toBeVisible();
      await expectShellClean(page, theme, testInfo.project.name);
    });

    test("mobile tab bar", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "MobileTabBar only renders <=768px");
      await page.goto(`/p/${seed.projectId}/v/current/define/requirements`);
      await expect(page.getByRole("navigation", { name: "Project" }).last()).toBeVisible();
      await expectShellClean(page, theme, testInfo.project.name);
    });
  });
}
