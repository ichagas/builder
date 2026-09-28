/**
 * US5 Assurance console (spec 007). Covers WP-A1 (T130): AssuranceLayout,
 * TeamSwitcher and the team portfolio -- NA-01 (team switcher lists the
 * caller's teams, plus every team in the organization for organization
 * admins, D-8) and NA-02 (team portfolio: applications with Standards
 * adoption, mesh reporting status and "not reporting" after 7 days).
 *
 * WP-A2..A6/O1 extend this file with the application page, mesh runs,
 * packs/policy, All teams and onboarding as their own tests land; T135
 * (the final 15-repo-seed spec) is the canonical end state -- this is the
 * first slice.
 *
 * Only exists in app/frontend-new (contracts/routes.md: "-- (new, US5,
 * US6)"), so this whole file is APP=new-only, same as shell/axe-shell.spec.ts.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, seed } from "../fixtures";

test.skip(process.env.APP !== "new", "The Assurance console only exists in app/frontend-new");

test.describe("NA-01: team switcher", () => {
  test("lists the caller's teams and switches the portfolio", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}`);
    await expect(page.getByRole("heading", { name: "Permits Platform" })).toBeVisible();

    await page.getByRole("button", { name: "Switch team" }).click();
    await expect(page.getByRole("menuitem", { name: /permits platform/i })).toBeVisible();

    // e2e-owner is an organization admin (seed.sql), so "All teams" lists
    // Licensing even though they aren't a member of it (D-8).
    await expect(page.getByText("All teams")).toBeVisible();
    await page.getByRole("menuitem", { name: /licensing/i }).click();

    await expect(page).toHaveURL(new RegExp(`/assurance/t/${seed.assuranceOtherTeamId}$`));
    await expect(page.getByRole("heading", { name: "Licensing" })).toBeVisible();
  });

  test("doesn't remount the shell when switching teams", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}`);
    // Tag the mounted GlobalBar so a remount (a fresh DOM node) is detectable.
    await page.locator("header").first().waitFor();
    await page.evaluate(() => document.querySelector("header")?.setAttribute("data-e2e-marker", "1"));

    await page.getByRole("button", { name: "Switch team" }).click();
    await page.getByRole("menuitem", { name: /licensing/i }).click();
    await expect(page).toHaveURL(new RegExp(`/assurance/t/${seed.assuranceOtherTeamId}$`));

    await expect(page.locator("header[data-e2e-marker='1']")).toHaveCount(1);
  });
});

test.describe("NA-02: team portfolio", () => {
  test("shows applications with Standards adoption and the not-reporting total", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}`);

    await expect(page.getByText("Permits API")).toBeVisible();
    await expect(page.getByText("Permits Portal")).toBeVisible();

    // NA-02 adoption: Permits API has one repo on each of 2026.1/2026.2.
    await expect(page.getByRole("img", { name: /1 on 2026\.1, 1 on 2026\.2/ })).toBeVisible();

    // NA-02 "not reporting" after 7 days: permits-worker's last_report_at is
    // 10 days old (seed.sql), so it's flagged both on the app row and its
    // own repo row.
    await expect(page.getByText("1 not reporting").first()).toBeVisible();
    await expect(page.getByText("e2e-goa/permits-worker")).toBeVisible();
  });

  test("filters to not-reporting repositories (URL-held state)", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}`);
    await expect(page.getByText("e2e-goa/permits-api")).toBeVisible();

    await page.getByRole("button", { name: /^not reporting/i }).click();
    await expect(page).toHaveURL(/[?&]f=notReporting/);
    await expect(page.getByText("e2e-goa/permits-worker")).toBeVisible();
    await expect(page.getByText("e2e-goa/permits-api")).not.toBeVisible();

    // Reload restores the filter from the URL (contracts/design-system.md
    // §3, useUrlState).
    await page.reload();
    await expect(page.getByText("e2e-goa/permits-worker")).toBeVisible();
    await expect(page.getByText("e2e-goa/permits-api")).not.toBeVisible();
  });

  test("a team never reported for (licensing-api, last_report_at null) shows not reporting immediately", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceOtherTeamId}`);
    await expect(page.getByText("Licensing API")).toBeVisible();
    await expect(page.getByText("e2e-goa/licensing-api")).toBeVisible();
    await expect(page.getByText("1 not reporting").first()).toBeVisible();
  });
});

test.describe("Assurance axe: zero violations", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`team portfolio -- ${theme} theme`, async ({ page }, testInfo) => {
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem("theme", t);
        } catch {
          // ignore
        }
      }, theme);
      await page.goto(`/assurance/t/${seed.assuranceTeamId}`);
      await expect(page.getByRole("heading", { name: "Permits Platform" })).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      const description = results.violations
        .map((v) => `[${theme}/${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
        .join("\n");
      expect(results.violations, description).toEqual([]);
    });
  }
});
