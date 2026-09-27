/**
 * Legacy redirect E2E (WP-F3 acceptance: "Redirects green", contracts/routes.md
 * §1). Runs only against `app/frontend-new` (APP=new) -- legacy has no
 * redirects to check, it *is* the source URLs. Every row of the route map's
 * legacy column is hit for real, in a real browser, and the final URL is
 * asserted -- unlike `app/frontend-new/src/app/__tests__/redirects.test.tsx`
 * (a unit test against `buildLegacyRedirectRoutes()` in isolation), this
 * exercises the full router (`createBrowserRouter`, layouts, lazy pages)
 * and a real network navigation via `page.goto`.
 */
import { test, expect, seed } from "../fixtures";

test.skip(process.env.APP !== "new", "Legacy redirects only apply to app/frontend-new");

const SIMPLE_ROWS: Array<[legacy: string, expectedSuffix: string]> = [
  ["/dashboard", "/projects"],
  ["/gallery", "/library/gallery"],
  ["/standards", "/library/standards"],
  ["/tech-stacks", "/library/tech-stacks"],
  ["/build-books", "/library/build-books"],
  ["/build-books/new", "/library/build-books/new"],
  [`/build-books/${seed.buildBookId}`, `/library/build-books/${seed.buildBookId}`],
  [`/build-books/${seed.buildBookId}/edit`, `/library/build-books/${seed.buildBookId}/edit`],
];

const PROJECT_ROWS: Array<[legacyPage: string, expectedSuffix: string]> = [
  ["settings", "/settings"],
  ["requirements", "/v/current/define/requirements"],
  ["standards", "/v/current/define/standards"],
  ["artifacts", "/v/current/define/artifacts"],
  ["chat", "/v/current/define/chat"],
  ["canvas", "/v/current/design/canvas"],
  ["specifications", "/v/current/design/specifications"],
  ["build", "/v/current/build/agent"],
  ["repository", "/v/current/build/repository"],
  ["database", "/v/current/build/database"],
  ["deploy", "/v/current/ship/environments"],
  ["audit", "/v/current/ship/audit"],
  ["present", "/v/current/ship/present"],
];

test.describe("legacy URL redirects (contracts/routes.md §1)", () => {
  for (const [legacy, expectedSuffix] of SIMPLE_ROWS) {
    test(`${legacy} -> ...${expectedSuffix}`, async ({ page }) => {
      await page.goto(legacy);
      await expect(page).toHaveURL(new RegExp(`${expectedSuffix.replace(/\//g, "\\/")}$`));
    });
  }

  for (const [legacyPage, expectedSuffix] of PROJECT_ROWS) {
    test(`/project/:id/${legacyPage} -> /p/:id${expectedSuffix}`, async ({ page }) => {
      await page.goto(`/project/${seed.projectId}/${legacyPage}`);
      await expect(page).toHaveURL(new RegExp(`/p/${seed.projectId}${expectedSuffix.replace(/\//g, "\\/")}$`));
    });

    test(`/project/:id/${legacyPage}/t/:token -> /p/:id${expectedSuffix}?t=:token`, async ({ page }) => {
      const token = "e2e-redirect-token";
      await page.goto(`/project/${seed.projectId}/${legacyPage}/t/${token}`);
      await expect(page).toHaveURL(
        new RegExp(`/p/${seed.projectId}${expectedSuffix.replace(/\//g, "\\/")}\\?t=${token}$`)
      );
    });
  }

  test("/ redirects a signed-in user to /projects", async ({ page }) => {
    // mockUser fixture is signed in by default (see fixtures.ts defaultOwner).
    await page.goto("/");
    await expect(page).toHaveURL(/\/projects$/);
  });
});

test.describe("/ for a signed-out visitor", () => {
  test.use({ mockUser: null });

  test("shows Landing, not a redirect loop", async ({ page }) => {
    await page.goto("/");
    // Anonymous mock user: no MSAL cache seeded, so useAuth().user is null.
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("unknown routes", () => {
  test("an unmapped path renders NotFound with links to Projects and Assurance", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-anywhere");
    await expect(page.getByText(/not found/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /projects/i })).toBeVisible();
  });
});
