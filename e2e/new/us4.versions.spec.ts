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

// ---------------------------------------------------------------------------
// NV-06 version scoping (T113, WP-V4). Phase tools under
// /p/:id/v/:versionId/<phase>/<tool>: a released version is a read-only
// baseline (banner + disabled controls); an open version shows its changes'
// requirement deltas above the tool; v/current stays untouched (D-7).
// Seed: versionCurrentId (v1.4.2, released), versionNextId (v1.5.0, open, WI-3
// with two requirement deltas 940/941).
// ---------------------------------------------------------------------------
test.describe("NV-06 version scoping", () => {
  const RELEASED_URL = `/p/${PROJECT_ID}/v/${seed.versionCurrentId}/define/requirements`;
  const OPEN_URL = `/p/${PROJECT_ID}/v/${seed.versionNextId}/define/requirements`;

  test("a released version shows the read-only banner and locks the tool", async ({ page }) => {
    await page.goto(RELEASED_URL);

    await expect(page.getByText(/v1\.4\.2 is released and read-only/)).toBeVisible();
    const locked = page.getByTestId("version-scope-readonly");
    await expect(locked).toBeVisible();
    // Every native control inside the tool is disabled.
    await expect(locked.locator("button:enabled, input:enabled, textarea:enabled, select:enabled")).toHaveCount(0);
  });

  test("an open version shows its changes and requirement deltas above the tool", async ({ page }) => {
    await page.goto(OPEN_URL);

    const panel = page.getByTestId("version-scope-changes");
    await expect(panel.getByRole("heading", { name: "Changes in v1.5.0" })).toBeVisible();
    await expect(panel.getByText("Applicants can save a draft and return later")).toBeVisible();
    await expect(panel.getByText("Saved drafts")).toBeVisible();
    await expect(panel.getByText("Application submission")).toBeVisible();
    await expect(panel.getByText("New", { exact: true })).toBeVisible();
    await expect(panel.getByText("Changed", { exact: true })).toBeVisible();
    // The tool itself is not locked.
    await expect(page.getByTestId("version-scope-readonly")).toHaveCount(0);
  });

  test("v/current is unscoped (no banner, no changes panel)", async ({ page }) => {
    await page.goto(REQUIREMENTS_URL);

    await expect(page.getByTestId("version-scope")).toHaveCount(0);
    await expect(page.getByText(/read-only$/)).toHaveCount(0);
  });

  test("selecting another version on the strip reopens the same tool scoped to it", async ({ page }) => {
    await page.goto(REQUIREMENTS_URL);

    await page.getByRole("tablist", { name: "Version timeline" }).getByRole("tab", { name: /v1\.5\.0/ }).click();
    await expect(page).toHaveURL(new RegExp(`/v/${seed.versionNextId}/define/requirements`));
    await expect(page.getByTestId("version-scope-changes")).toBeVisible();
  });

  test.describe("axe: zero violations", () => {
    for (const [name, url, testId] of [
      ["released version", RELEASED_URL, "version-scope-readonly"],
      ["open version", OPEN_URL, "version-scope-changes"],
    ] as const) {
      test(`${name}`, async ({ page }, testInfo) => {
        await page.goto(url);
        await expect(page.getByTestId(testId)).toBeVisible();

        const results = await new AxeBuilder({ page }).analyze();
        const description = results.violations
          .map((v) => `[${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
          .join("\n");
        expect(results.violations, description).toEqual([]);
      });
    }

// ===========================================================================
// NV-05 release (T112, WP-V3). Own seed projects (e2e/seed.sql ids 930..93f):
// no repository is linked (a real merge/tag needs GitHub), so the release
// itself is exercised with the checks GET and the release POST mocked; the
// checks, ordering, carry-over and read-only states use the real backend.
// ===========================================================================
test.describe("NV-05 release", () => {
  const FIRST = seed.releaseFirstProjectId;
  const ORDERED = seed.releaseOrderedProjectId;
  const firstUrl = `/p/${FIRST}/v/v1.0.0/ship/release`;
  const nextUrl = `/p/${ORDERED}/v/v1.1.0/ship/release`;
  const hotfixUrl = `/p/${ORDERED}/v/v1.0.1/ship/release`;

  test("first release: an unfinished change and a missing repository block it", async ({ page }) => {
    await page.goto(firstUrl);

    await expect(page.getByRole("heading", { name: "Release v1.0.0", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Release checks for v1.0.0" })).toBeVisible();

    const checks = page.getByTestId("release-checks");
    await expect(checks.locator("[data-check='work-items-resolved']")).toHaveAttribute("data-state", "fail");
    await expect(checks.locator("[data-check='repository-linked']")).toHaveAttribute("data-state", "fail");
    await expect(page.getByRole("button", { name: "Release v1.0.0" })).toBeDisabled();

    // Drafted notes list the shipped change; carry-over only applies after the first release.
    await expect(page.getByTestId("release-notes").getByText("Applicants can upload supporting documents")).toBeVisible();
    await expect(page.getByTestId("release-carry")).toHaveCount(0);
  });

  test("versions release in order: v1.1.0 is blocked by the open hotfix v1.0.1", async ({ page }) => {
    await page.goto(nextUrl);

    await expect(page.getByRole("heading", { name: "Release v1.1.0", level: 1 })).toBeVisible();
    await expect(page.getByText("Release v1.0.1 first")).toBeVisible();
    await expect(page.getByTestId("release-checks").locator("[data-check='no-open-earlier-version']")).toHaveAttribute(
      "data-state",
      "fail",
    );
    await expect(page.getByRole("button", { name: "Release v1.1.0" })).toBeDisabled();

    await page.getByRole("link", { name: "Open release v1.0.1" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${ORDERED}/v/v1\\.0\\.1/ship/release$`));
    await expect(page.getByRole("heading", { name: "Release v1.0.1", level: 1 })).toBeVisible();
  });

  test("shows the unfinished change carrying over to the next version", async ({ page }) => {
    await page.goto(nextUrl);

    const carry = page.getByTestId("release-carry");
    await expect(carry.getByText("1 unfinished change moves to v1.2.0 when you release.")).toBeVisible();
    await expect(carry.getByText("Add a print view for the decision letter")).toBeVisible();
    await expect(page.getByTestId("release-notes").getByText("Status page shows a stale case count")).toBeVisible();
  });

  test("a released version is read-only", async ({ page }) => {
    await page.goto(`/p/${ORDERED}/v/v1.0.0/ship/release`);

    await expect(page.getByText("v1.0.0 is released and read-only")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Release v1\.0\.0/ })).toHaveCount(0);
  });

  test("release needs a second confirming click and goes to All versions", async ({ page }) => {
    let releasePosts = 0;
    await page.route("**/release-checks**", (route) =>
      route.fulfill({
        json: {
          projectId: ORDERED,
          canRelease: true,
          checks: [{ id: "repository-linked", label: "A repository is linked for tagging and merges", passed: true }],
        },
      }),
    );
    await page.route(`**/versions/${seed.releaseOrderedHotfixVersionId}/release**`, (route) => {
      releasePosts += 1;
      return route.fulfill({
        json: {
          version: {
            id: seed.releaseOrderedHotfixVersionId,
            project_id: ORDERED,
            name: "v1.0.1",
            kind: "released",
            is_current: true,
            is_first_release: false,
            released_at: new Date().toISOString(),
            released_by: null,
            release_notes: "- Fixed: Confirmation email drops the case number",
            git_tag: "v1.0.1",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deployTriggered: false,
            deployReason: "no-deployment-configured",
          },
          carriedOverWorkItemIds: [],
        },
      });
    });

    await page.goto(hotfixUrl);
    await page.getByRole("button", { name: "Release v1.0.1" }).click();
    // First click only asks to confirm.
    await expect(page.getByRole("button", { name: "Confirm: release v1.0.1" })).toBeVisible();
    expect(releasePosts).toBe(0);

    await page.getByRole("button", { name: "Confirm: release v1.0.1" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${ORDERED}/versions$`));
    expect(releasePosts).toBe(1);
  });

  test("the release page has zero axe violations", async ({ page }, testInfo) => {
    await page.goto(nextUrl);
    await expect(page.getByRole("heading", { name: "Release checks for v1.1.0" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const description = results.violations
      .map((v) => `[${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
      .join("\n");
    expect(results.violations, description).toEqual([]);
  });
});
