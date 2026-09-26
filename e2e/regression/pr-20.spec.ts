/**
 * PR-20 Settings and admin.
 * Capabilities exercised: admin user management (list, set role) as a
 * signed-in admin; the auth page's "continue without signing in" and
 * "missing code/state" GitHub callback error path when signed out.
 * Not exercised: superadmin cloud/GitHub/render managers (no route exists
 * in app/frontend -- these are new-only capabilities per contracts/routes.md
 * and App.tsx), signup code validation (no signup flow in the legacy app;
 * sign-in is SSO-only) -- see e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, defaultOwner } from "../fixtures";
import { routes, urlPattern } from "../routes";

test.describe("signed in as admin", () => {
  test("PR-20 settings: admin user management loads, lists self, sets a role, reloads", async ({
    page,
  }, testInfo) => {
    await page.goto(routes.settingsOrganization());
    await expect(page.getByRole("heading", { name: "Admin User Management" })).toBeVisible();

    // main read: the signed-in admin is listed, tagged "You"
    const ownerRow = page.getByRole("row", { name: new RegExp(defaultOwner.email) });
    await expect(ownerRow).toBeVisible();
    await expect(ownerRow.getByText("You")).toBeVisible();

    // main write: re-set the owner's own role to admin (idempotent, always
    // valid). Locator is by id, not label -- "User Email" labels both this
    // field and the Delete User card's field.
    await page.locator("#email").fill(defaultOwner.email);
    await page.getByRole("button", { name: "Set Role" }).click();
    await expect(page.getByText("Role updated")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Admin User Management" })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(defaultOwner.email) })).toBeVisible();

    await recordAxeBaseline(page, "pr-20-admin", testInfo);
  });

  test("PR-20 settings: profile route renders the same admin page", async ({ page }) => {
    await page.goto(routes.settingsProfile());
    await expect(page.getByRole("heading", { name: "Admin User Management" })).toBeVisible();
  });
});

test.describe("signed out", () => {
  test.use({ mockUser: null });

  test("PR-20 auth: loads, continues without signing in", async ({ page }, testInfo) => {
    await page.goto(routes.auth());
    await expect(page.getByText("Welcome to Pronghorn")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Microsoft" })).toBeVisible();

    await page.getByRole("button", { name: "Continue without signing in" }).click();
    await expect(page).toHaveURL(urlPattern(routes.projectsHome()));

    await recordAxeBaseline(page, "pr-20-auth", testInfo);
  });

  test("PR-20 github callback: missing code/state shows a deterministic error", async ({
    page,
  }) => {
    await page.goto(routes.githubCallback());
    await expect(page.getByText("Missing authorization code or state parameter.")).toBeVisible();
  });
});
