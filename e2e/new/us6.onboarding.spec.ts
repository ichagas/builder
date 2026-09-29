/**
 * US6 Onboarding wizard, steps 1-2 (spec 007). Covers WP-O1 (T150):
 * OnboardingWizard's "Team & app" and "Connect repos" steps --
 * NO-01 (start a draft run from a team's portfolio, advance to Connect
 * repos, cancel) and NO-02 (repository import/selection: scoped to the
 * organization's configured connections, a repository outside that scope
 * is refused with 403, a case-insensitive duplicate in one selection is
 * refused with 422, and a saved selection survives a reload).
 *
 * WP-O2 (T151/T152) extends this file with steps 3-5 (run in sandbox --
 * mocked in CI, review output, open pull requests) as they land.
 *
 * Only exists in app/frontend-new (contracts/routes.md: "-- (new, US5,
 * US6)"), same as us5.assurance.spec.ts.
 *
 * NO-02's live import lists (`GET /onboarding/{github,azure}/repos`) call
 * the real GitHub/Azure DevOps APIs server-side once an organization has a
 * configured connection (services/onboarding/{github,azure}Import.ts) --
 * there is no real GitHub App installation or Azure DevOps PAT in the e2e
 * stack, and mocking that (unlike the sandbox job, T152) is out of this
 * WP's scope. So:
 *  - the "browse" UI is only asserted to render an empty or a clean inline
 *    error state -- never an unhandled crash -- whichever the (no real
 *    installation) response resolves to;
 *  - the scope check itself (`PUT .../repositories`, 403/422) is DB-only
 *    (no external call -- `services/onboarding/repositoryScope.ts`) and is
 *    exercised directly against the API, which is also the realistic way
 *    these two errors occur: the UI's own import list is already
 *    pre-filtered to the organization's scope, so a real user can't
 *    construct an out-of-scope or duplicate selection through the
 *    checkboxes -- only a direct call (or a race) can. `seed.sql` seeds a
 *    `github_app` connection scoped to owner "e2e-goa" for the E2E org, so
 *    an "e2e-goa/..." full_name is in scope (used by the "saved selection"
 *    test) and anything else is refused;
 *  - the "selection saved and shown after reload" flow seeds the
 *    selection the same way, then loads the wizard UI to assert it
 *    renders from the run's own data, independent of the (unavailable)
 *    live import list.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, seed, api, tokenFor, defaultOwner, unique } from "../fixtures";
import { config } from "../lib/config";

test.skip(process.env.APP !== "new", "The onboarding wizard only exists in app/frontend-new");

const API_BASE = config.apiBaseUrl;

interface RawResponse {
  status: number;
  body: any;
}

/** Direct (Node-side) API call that returns the status code, unlike `api.*` which throws on non-2xx. */
async function rawRequest(method: string, path: string, body?: unknown): Promise<RawResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor(defaultOwner)}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

async function createDraftRun(applicationName: string): Promise<{ id: string }> {
  return api.post("/api/v1/onboarding/runs", defaultOwner, {
    teamId: seed.assuranceTeamId,
    applicationName,
  });
}

test.describe("NO-01: start and cancel an onboarding run", () => {
  test("starts a draft run from Team & app and advances to Connect repos", async ({ page }) => {
    const appName = unique("E2E Onboarded App");
    await page.goto(`/assurance/t/${seed.assuranceTeamId}/onboard`);
    await expect(page.getByRole("heading", { name: "Onboard an app" })).toBeVisible();

    // Stepper: "Team & app" is the only clickable/active step before a run exists.
    await expect(page.getByRole("button", { name: /connect repos/i })).toBeDisabled();

    await page.getByLabel("Application name").fill(appName);
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/assurance/t/${seed.assuranceTeamId}/onboard/connect\\?run=`));
    await expect(page.getByRole("heading", { name: appName })).toBeVisible();
    await expect(page.getByText("Selected repositories")).toBeVisible();

    // The "Team & app" step is now done (its own button navigates back to a
    // read-only summary) and "Connect repos" is the active step.
    await page.getByRole("button", { name: /team & app/i }).click();
    await expect(page.getByRole("heading", { name: appName })).toBeVisible();
    await expect(page.getByLabel("Application name")).toBeDisabled();
    await expect(page.getByText("Draft started")).toBeVisible();
  });

  test("cancels a draft run and returns to the team portfolio", async ({ page }) => {
    const appName = unique("E2E Cancel Me");
    const run = await createDraftRun(appName);

    await page.goto(`/assurance/t/${seed.assuranceTeamId}/onboard/connect?run=${run.id}`);
    await expect(page.getByRole("heading", { name: appName })).toBeVisible();

    // ActionButton's two-step confirm changes the button's accessible name
    // from "Cancel onboarding" to the confirm copy ("Cancel this run?") --
    // match loosely so the second click re-resolves the same button.
    const cancelButton = page.getByRole("button", { name: /cancel/i });
    await cancelButton.click();
    await cancelButton.click();

    await expect(page).toHaveURL(new RegExp(`/assurance/t/${seed.assuranceTeamId}$`));
    await expect(page.getByRole("heading", { name: "Permits Platform" })).toBeVisible();

    const cancelled = await api.get<{ status: string }>(`/api/v1/onboarding/runs/${run.id}`, defaultOwner);
    expect(cancelled.status).toBe("cancelled");
  });
});

test.describe("NO-02: connect repos -- scope, duplicates, saved selection", () => {
  test("rejects a repository outside the organization's configured scope (403)", async () => {
    const run = await createDraftRun(unique("E2E Scope App"));
    const res = await rawRequest("PUT", `/api/v1/onboarding/runs/${run.id}/repositories`, {
      repositories: [{ fullName: seed.onboardingOutOfScopeFullName, selected: true }],
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain(seed.onboardingOutOfScopeFullName);
  });

  test("rejects a case-insensitive duplicate in the same selection (422)", async () => {
    const run = await createDraftRun(unique("E2E Duplicate App"));
    const fullName = `${seed.onboardingAllowedOwner}/dup-repo`;
    const res = await rawRequest("PUT", `/api/v1/onboarding/runs/${run.id}/repositories`, {
      repositories: [
        { fullName, selected: true },
        { fullName: fullName.toUpperCase(), selected: true },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.details?.repositories).toMatch(/more than once/i);
  });

  test("saves a valid in-scope selection and shows it after reload", async ({ page }) => {
    const run = await createDraftRun(unique("E2E Saved Selection App"));
    const fullName = `${seed.onboardingAllowedOwner}/onboard-target`;
    const saveRes = await rawRequest("PUT", `/api/v1/onboarding/runs/${run.id}/repositories`, {
      repositories: [{ fullName, selected: true }],
    });
    expect(saveRes.status).toBe(200);

    await page.goto(`/assurance/t/${seed.assuranceTeamId}/onboard/connect?run=${run.id}`);
    await expect(page.getByText("Selected repositories")).toBeVisible();
    await expect(page.getByText(fullName)).toBeVisible();
    await expect(page.getByText("1 selected")).toBeVisible();

    // Steps 3-5 aren't implemented by this WP yet -- a lock-toned banner
    // says so instead of a dead "Continue" (WP-O2, T151).
    await expect(page.getByText("Run in sandbox is coming in a future update")).toBeVisible();

    await page.reload();
    await expect(page.getByText(fullName)).toBeVisible();
  });

  test("the import list renders an empty/error state, never a crash, without a real GitHub App installation", async ({ page }) => {
    // The e2e stack has no real GitHub App credentials, so this either
    // resolves to `[]` (no configured connection) or fails cleanly (a
    // configured connection but no real installation to call) -- the class
    // docstring covers why this WP doesn't stand up a full mock; either
    // outcome must render without an unhandled crash.
    const run = await createDraftRun(unique("E2E Browse App"));
    await page.goto(`/assurance/t/${seed.assuranceTeamId}/onboard/connect?run=${run.id}`);

    await expect(page.getByText("Import repositories")).toBeVisible();
    // Either the empty state or an inline "couldn't load" message -- never
    // an unhandled error boundary/blank page (contracts/api.md's "no raw
    // upstream error" rule, applied to the frontend's own rendering).
    await expect(page.getByText(/no repositories to import|couldn.t load repositories/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Onboarding wizard axe: zero violations", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`Team & app step -- ${theme} theme`, async ({ page }, testInfo) => {
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem("theme", t);
        } catch {
          // ignore
        }
      }, theme);
      await page.goto(`/assurance/t/${seed.assuranceTeamId}/onboard`);
      await expect(page.getByRole("heading", { name: "Onboard an app" })).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      const description = results.violations
        .map((v) => `[${theme}/${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
        .join("\n");
      expect(results.violations, description).toEqual([]);
    });

    test(`Connect repos step -- ${theme} theme`, async ({ page }, testInfo) => {
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem("theme", t);
        } catch {
          // ignore
        }
      }, theme);
      const run = await createDraftRun(unique("E2E Axe Connect App"));
      await page.goto(`/assurance/t/${seed.assuranceTeamId}/onboard/connect?run=${run.id}`);
      await expect(page.getByText("Selected repositories")).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      const description = results.violations
        .map((v) => `[${theme}/${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
        .join("\n");
      expect(results.violations, description).toEqual([]);
    });
  }
});
