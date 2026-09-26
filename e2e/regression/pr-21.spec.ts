/**
 * PR-21 Public: Landing, legal, PWA, theme.
 * Capabilities exercised: landing page loads and its Login link goes to
 * /auth; Terms/Privacy/License pages load; the theme toggle switches the
 * document's class and persists across reload.
 * Not exercised: the PWA install/update prompts (`PWAUpdatePrompt.tsx`) --
 * they depend on the real `beforeinstallprompt`/service-worker-update
 * browser events, which aren't available under `vite dev` and can't be
 * fired deterministically in a test -- see e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline } from "../fixtures";
import { routes, urlPattern } from "../routes";

test.use({ mockUser: null }); // the public pages are all unauthenticated

test("PR-21 landing: loads, theme toggle persists, login link goes to /auth", async ({
  page,
}, testInfo) => {
  await page.goto(routes.welcome());
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Build");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Apps with AI");

  // default theme is dark (ThemeProvider defaultTheme="dark")
  await expect(page.locator("html")).toHaveClass(/dark/);

  // main write: toggle theme, persists across reload
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  // toggle back so this test doesn't leak state into other workers' runs
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(urlPattern(routes.auth()));

  await recordAxeBaseline(page, "pr-21-landing", testInfo);
});

test("PR-21 legal: terms, privacy and license pages load", async ({ page }, testInfo) => {
  await page.goto(routes.terms());
  await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();

  await page.goto(routes.privacy());
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

  await page.goto(routes.license());
  await expect(page.getByRole("heading", { name: "MIT License" })).toBeVisible();

  await recordAxeBaseline(page, "pr-21-legal", testInfo);
});
