/**
 * US4 Versions and changes (spec 007). Covers WP-V1 (T110): the version
 * timeline wired into the shell's `TimelineStrip` (NV-01) and the "All
 * versions" route with triage -- unscheduled changes suggesting a hotfix
 * vs the next open version (NV-02).
 *
 * WP-V2..V4 extend this file with the change page, release and per-version
 * phase scoping as their own tests land.
 *
 * Only exists in app/frontend-new (contracts/routes.md: "-- (new, US4)"),
 * so this whole file is APP=new-only, same as us5.assurance.spec.ts.
 *
 * Seed (e2e/seed.sql, "US4 Versions and changes"): its own project
 * (`seed.versionsProjectId`, not the shared baseline project) with one
 * released "current" version (v1.4.2, first release) and one open "next"
 * version (v1.5.0, one change already scheduled into it), plus two
 * unscheduled (triage) changes -- a high-severity bug (WI-1, suggests a
 * hotfix) and an enhancement (WI-2, suggests the next open version).
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, seed, api, unique, defaultOwner } from "../fixtures";

test.skip(process.env.APP !== "new", "Versions/changes only exist in app/frontend-new");

const PROJECT_ID = seed.versionsProjectId;
const REQUIREMENTS_URL = `/p/${PROJECT_ID}/v/current/define/requirements`;
const VERSIONS_URL = `/p/${PROJECT_ID}/versions`;

test.describe("NV-01: version timeline", () => {
  test("shows the released current version and the open next version on the shell strip", async ({ page }) => {
    await page.goto(REQUIREMENTS_URL);

    const strip = page.getByRole("tablist", { name: "Version timeline" });
    await expect(strip.getByRole("tab", { name: /v1\.4\.2/ })).toHaveAttribute("aria-selected", "true");
    await expect(strip.getByRole("tab", { name: /v1\.5\.0/ })).toBeVisible();
    await expect(strip.getByText("First release")).toBeVisible();
  });

  test("selecting a version on the strip opens All versions", async ({ page }) => {
    await page.goto(REQUIREMENTS_URL);

    await page.getByRole("tab", { name: /v1\.5\.0/ }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${PROJECT_ID}/versions$`));
  });

  test("doesn't remount the shell when navigating from the timeline", async ({ page }) => {
    await page.goto(REQUIREMENTS_URL);
    await page.locator("header").first().waitFor();
    await page.evaluate(() => document.querySelector("header")?.setAttribute("data-e2e-marker", "1"));

    await page.getByRole("tab", { name: /v1\.5\.0/ }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${PROJECT_ID}/versions$`));

    await expect(page.locator("header[data-e2e-marker='1']")).toHaveCount(1);
  });
});

test.describe("NV-02: All versions and triage", () => {
  test("suggests a hotfix for a high-severity bug", async ({ page }) => {
    await page.goto(VERSIONS_URL);

    await expect(page.getByRole("heading", { name: /current release v1\.4\.2/i })).toBeVisible();

    const bugRow = page.getByText("Confirmation email shows the wrong submission date").locator("xpath=ancestor::details");
    await bugRow.getByText("Confirmation email shows the wrong submission date").click();

    await expect(bugRow.getByText(/suggested: hotfix/i)).toBeVisible();
    await expect(bugRow.getByRole("button", { name: /start a hotfix/i })).toBeVisible();
  });

  test("suggests the next open version for a non-critical change", async ({ page }) => {
    await page.goto(VERSIONS_URL);

    const enhRow = page.getByText("Show the eligibility result faster").locator("xpath=ancestor::details");
    await enhRow.getByText("Show the eligibility result faster").click();

    await expect(enhRow.getByText(/suggested: next release/i)).toBeVisible();
    await expect(enhRow.getByRole("button", { name: "Schedule in v1.5.0" })).toBeVisible();
  });

  test("scheduling a change removes it from the triage inbox", async ({ page }) => {
    // Created fresh (not the fixed-id seeded WI-1/WI-2) so this mutation
    // can't race the desktop/mobile Playwright projects, which may run
    // this file concurrently against the same seeded database
    // (playwright.config.ts: "pages share seeded projects").
    const title = unique("Speed up the eligibility check");
    await api.post(`/api/v1/projects/${PROJECT_ID}/work-items`, defaultOwner, { type: "enhancement", title });

    await page.goto(VERSIONS_URL);
    const row = page.getByText(title).locator("xpath=ancestor::details");
    await row.getByText(title).click();
    await row.getByRole("button", { name: "Schedule in v1.5.0" }).click();

    await expect(page.getByText(title)).not.toBeVisible();
  });

  test("declining a change removes it from the triage inbox", async ({ page }) => {
    const title = unique("Duplicate report, not actionable");
    await api.post(`/api/v1/projects/${PROJECT_ID}/work-items`, defaultOwner, { type: "enhancement", title });

    await page.goto(VERSIONS_URL);
    const row = page.getByText(title).locator("xpath=ancestor::details");
    await row.getByText(title).click();
    await row.getByRole("button", { name: "Decline" }).click();
    await row.getByRole("button", { name: "Decline this change?" }).click(); // two-step confirm (ActionButton)

    await expect(page.getByText(title)).not.toBeVisible();
  });

  test("shows the released version and the open version in their own lanes", async ({ page }) => {
    await page.goto(VERSIONS_URL);

    const inProgress = page.getByRole("heading", { name: "In progress" }).locator("xpath=ancestor::section");
    await expect(inProgress.getByText("v1.5.0")).toBeVisible();

    const released = page.getByRole("heading", { name: "Released" }).locator("xpath=ancestor::section");
    await expect(released.getByText("v1.4.2")).toBeVisible();
    await expect(released.getByText("First release")).toBeVisible();
  });
});

test.describe("Versions axe: zero violations", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`All versions -- ${theme} theme`, async ({ page }, testInfo) => {
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem("theme", t);
        } catch {
          // ignore
        }
      }, theme);
      await page.goto(VERSIONS_URL);
      await expect(page.getByRole("heading", { name: /current release v1\.4\.2/i })).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      const description = results.violations
        .map((v) => `[${theme}/${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
        .join("\n");
      expect(results.violations, description).toEqual([]);
    });
  }
});
