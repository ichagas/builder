/**
 * US6 Onboarding wizard, steps 1-2 (spec 007). Covers WP-O1 (T150):
 * OnboardingWizard's "Team and application" and "Connect repositories" steps --
 * NO-01 (start a draft run from a team's portfolio, advance to Connect
 * repos, cancel) and NO-02 (repository import/selection: scoped to the
 * organization's configured connections, a repository outside that scope
 * is refused with 403, a case-insensitive duplicate in one selection is
 * refused with 422, and a saved selection survives a reload).
 *
 * WP-O2 (T151/T152) appends NO-03..NO-05 (run in sandbox, review output, open
 * pull requests) in the delimited block at the end of this file. The sandbox
 * job itself is BLOCKED-EXTERNAL, so those tests either read seeded runs in
 * fixed states (seed.sql, ids ...990-...99f) or mock the job/PR endpoints with
 * `page.route`; the real run is documented in specs/007-frontend-new/quickstart.md.
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
  test("starts a draft run from Team and application and advances to Connect repositories", async ({ page }) => {
    const appName = unique("E2E Onboarded App");
    await page.goto(`/assurance/t/${seed.assuranceTeamId}/onboard`);
    await expect(page.getByRole("heading", { name: "Onboard an application" })).toBeVisible();

    // Stepper: "Team and application" is the only clickable/active step before a run exists.
    await expect(page.getByRole("button", { name: /connect repositories/i })).toBeDisabled();

    await page.getByLabel("Application name").fill(appName);
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/assurance/t/${seed.assuranceTeamId}/onboard/connect\\?run=`));
    await expect(page.getByRole("heading", { name: appName })).toBeVisible();
    await expect(page.getByText("Selected repositories")).toBeVisible();

    // The "Team and application" step is now done (its own button navigates back to a
    // read-only summary) and "Connect repositories" is the active step.
    await page.getByRole("button", { name: /team and application/i }).click();
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

    // Once the selection is saved the primary action becomes "Continue" to
    // the sandbox step (WP-O2, T151).
    await expect(page.getByText("Selection saved")).toBeVisible();

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
    test(`Team and application step -- ${theme} theme`, async ({ page }, testInfo) => {
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem("theme", t);
        } catch {
          // ignore
        }
      }, theme);
      await page.goto(`/assurance/t/${seed.assuranceTeamId}/onboard`);
      await expect(page.getByRole("heading", { name: "Onboard an application" })).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      const description = results.violations
        .map((v) => `[${theme}/${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
        .join("\n");
      expect(results.violations, description).toEqual([]);
    });

    test(`Connect repositories step -- ${theme} theme`, async ({ page }, testInfo) => {
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

// ===========================================================================
// WP-O2 (T152): NO-03 / NO-04 / NO-05 -- steps 3-5. Written, run in the batch test pass.
// ===========================================================================

const ONBOARD = `/assurance/t/${seed.assuranceTeamId}/onboard`;

/** A run as the API returns it, read from the (seeded or real) run; the tests override fields to mock states. */
async function readRun(runId: string): Promise<any> {
  return api.get(`/api/v1/onboarding/runs/${runId}`, defaultOwner);
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("NO-03: run in the sandbox with a live log", () => {
  test("a running run shows the log region waiting for progress", async ({ page }) => {
    await page.goto(`${ONBOARD}/sandbox?run=${seed.onboardingRunningRunId}`);
    await expect(page.getByText("Sandbox is running")).toBeVisible();
    const log = page.getByRole("log", { name: "Sandbox log" });
    await expect(log).toBeVisible();
    await expect(log).toContainText("Waiting for the sandbox");
    await expect(page.getByText("e2e-goa/onboard-running")).toBeVisible();
    // Cancel stays available while the job runs.
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("a finished run shows its recorded log and continues to the output review", async ({ page }) => {
    await page.goto(`${ONBOARD}/sandbox?run=${seed.onboardingReadyRunId}`);
    await expect(page.getByText("Sandbox finished")).toBeVisible();
    const log = page.getByRole("log", { name: "Sandbox log" });
    await expect(log).toContainText("detected node");
    await page.getByRole("button", { name: "Continue to review" }).click();
    await expect(page).toHaveURL(new RegExp(`/onboard/output\\?run=${seed.onboardingReadyRunId}`));
    await expect(page.getByTestId("onboarding-output")).toBeVisible();
  });

  test("a failed job shows a clear failure and a way to start over", async ({ page }) => {
    await page.goto(`${ONBOARD}/sandbox?run=${seed.onboardingFailedRunId}`);
    await expect(page.getByText("The sandbox run failed")).toBeVisible();
    await expect(page.getByRole("log", { name: "Sandbox log" })).toContainText("sandbox job failed");
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page).toHaveURL(new RegExp(`${ONBOARD}$`));
    await expect(page.getByLabel("Application name")).toBeVisible();
  });

  test("starting the (mocked) sandbox job streams to completion without a reload", async ({ page }) => {
    const run = await createDraftRun(unique("E2E Mock Sandbox App"));
    const saved = await rawRequest("PUT", `/api/v1/onboarding/runs/${run.id}/repositories`, {
      repositories: [{ fullName: `${seed.onboardingAllowedOwner}/mock-sandbox`, selected: true }],
    });
    expect(saved.status).toBe(200);
    const base = saved.body;

    // The sandbox job is BLOCKED-EXTERNAL: mock the start call and the run's
    // status. The run reports "running" for two polls, then "ready" with its log.
    let started = false;
    let polls = 0;
    await page.route(`**/api/v1/onboarding/runs/${run.id}/start`, async (route) => {
      started = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...base, status: "running" }) });
    });
    await page.route(new RegExp(`/api/v1/onboarding/runs/${run.id}$`), async (route) => {
      if (route.request().method() !== "GET" || !started) return route.continue();
      polls += 1;
      const ready = polls > 2;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...base,
          status: ready ? "ready" : "running",
          log_blob: ready ? "cloned mock-sandbox\ndetected node\ngenerated 1 file" : null,
        }),
      });
    });

    await page.goto(`${ONBOARD}/sandbox?run=${run.id}`);
    await expect(page.getByText("Ready to run in the sandbox")).toBeVisible();
    await page.getByRole("button", { name: "Start sandbox run" }).click();
    await expect(page.getByText("Sandbox is running")).toBeVisible();
    await expect(page.getByText("Sandbox finished")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("log", { name: "Sandbox log" })).toContainText("generated 1 file");
    await expect(page.getByRole("button", { name: "Continue to review" })).toBeVisible();
  });

  test("steps beyond what the run has unlocked are not reachable", async ({ page }) => {
    await page.goto(`${ONBOARD}/prs?run=${seed.onboardingRunningRunId}`);
    // A running run clamps to the sandbox step; output and PR steps stay locked.
    await expect(page.getByText("Sandbox is running")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review output" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Open pull requests" })).toBeDisabled();
  });
});

test.describe("NO-04: review the sandbox output", () => {
  test("shows what was detected and generated per repository, and a per-repository failure", async ({ page }) => {
    await page.goto(`${ONBOARD}/output?run=${seed.onboardingReadyRunId}`);
    const cards = page.getByTestId("onboarding-output-repo");
    await expect(cards).toHaveCount(2);

    const ok = cards.filter({ hasText: "e2e-goa/onboard-ready" });
    await expect(ok.getByText("Node.js")).toBeVisible();
    await expect(ok.getByText("npm ci && npm run build")).toBeVisible();
    await expect(ok.getByText("3 green")).toBeVisible();
    await expect(ok.getByText("2 blue")).toBeVisible();
    await ok.getByText(".github/workflows/assurance-mesh.yml").click();
    await expect(ok.getByText("name: assurance-mesh")).toBeVisible();

    const broken = cards.filter({ hasText: "e2e-goa/onboard-broken" });
    await expect(broken.getByRole("alert")).toContainText("clone failed: repository is empty");

    await expect(page.getByText(/1 of 2 repositories have generated files/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("continues to pull requests, and writes nothing to a repository yet", async ({ page }) => {
    let mutations = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/v1/onboarding/") && req.method() !== "GET") mutations += 1;
    });
    await page.goto(`${ONBOARD}/output?run=${seed.onboardingReadyRunId}`);
    await page.getByRole("button", { name: "Continue to pull requests" }).click();
    await expect(page).toHaveURL(new RegExp(`/onboard/prs\\?run=${seed.onboardingReadyRunId}`));
    expect(mutations).toBe(0);
  });

  test("the output of a run that has not finished is a clean error, not a crash", async ({ page }) => {
    await page.route(`**/api/v1/onboarding/runs/${seed.onboardingReadyRunId}/output`, (route) =>
      route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Output is not available while the run is \"running\"" }) }),
    );
    await page.goto(`${ONBOARD}/output?run=${seed.onboardingReadyRunId}`);
    await expect(page.getByText("Couldn't load the output")).toBeVisible();
  });
});

test.describe("NO-05: open the pull requests", () => {
  test("opens one PR per repository only after an explicit confirm, then shows the result", async ({ page }) => {
    const base = await readRun(seed.onboardingReadyRunId);
    const opened = {
      ...base,
      status: "prs_open",
      application_id: seed.assuranceApp1Id,
      warnings: ["e2e-goa/onboard-broken: no generated files to open a PR from"],
      repositories: base.repositories.map((r: any) =>
        r.id === seed.onboardingReadyRepoId ? { ...r, pr_number: 7, pr_state: "open" } : r,
      ),
    };
    let posts = 0;
    let confirmBody: unknown;
    await page.route(`**/api/v1/onboarding/runs/${seed.onboardingReadyRunId}/pull-requests`, async (route) => {
      posts += 1;
      confirmBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opened) });
    });

    await page.goto(`${ONBOARD}/prs?run=${seed.onboardingReadyRunId}`);
    await expect(page.getByTestId("onboarding-prs")).toBeVisible();

    // Two-step confirm: the first click only asks; nothing is sent yet.
    const open = page.getByRole("button", { name: /^open 1 pull request/i });
    await open.click();
    await expect(page.getByRole("button", { name: "Open 1 pull request in your repository?" })).toBeVisible();
    expect(posts).toBe(0);
    await page.getByRole("button", { name: "Open 1 pull request in your repository?" }).click();

    await expect(page.getByText("PR #7 · open")).toBeVisible();
    expect(posts).toBe(1);
    expect(confirmBody).toEqual({ confirm: true });
    await expect(page.getByTestId("onboarding-pr-warnings")).toContainText("no generated files");
    await expect(page.getByRole("link", { name: "View application" })).toHaveAttribute(
      "href",
      `/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}`,
    );
  });

  test("a failed PR attempt shows a plain error and leaves the action available to retry", async ({ page }) => {
    await page.route(`**/api/v1/onboarding/runs/${seed.onboardingReadyRunId}/pull-requests`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "upstream exploded: secret-stack-trace" }) }),
    );
    await page.goto(`${ONBOARD}/prs?run=${seed.onboardingReadyRunId}`);
    await page.getByRole("button", { name: /^open 1 pull request/i }).click();
    await page.getByRole("button", { name: "Open 1 pull request in your repository?" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't open the pull requests" })).toBeVisible();
    await expect(page.getByText("secret-stack-trace")).toHaveCount(0);
  });

  test("a run with opened PRs shows them and links to the application", async ({ page }) => {
    await page.goto(`${ONBOARD}/prs?run=${seed.onboardingPrsOpenRunId}`);
    await expect(page.getByText("Pull requests opened")).toBeVisible();
    await expect(page.getByText("PR #42 · open")).toBeVisible();
    await page.getByRole("link", { name: "View application" }).click();
    await expect(page).toHaveURL(new RegExp(`/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}$`));
    await expect(page.getByText("Permits API").first()).toBeVisible();
  });
});

test.describe("Onboarding steps 3-5 axe: zero violations", () => {
  const screens: Array<[string, () => string]> = [
    ["Sandbox running", () => `${ONBOARD}/sandbox?run=${seed.onboardingRunningRunId}`],
    ["Sandbox finished", () => `${ONBOARD}/sandbox?run=${seed.onboardingReadyRunId}`],
    ["Sandbox failed", () => `${ONBOARD}/sandbox?run=${seed.onboardingFailedRunId}`],
    ["Review output", () => `${ONBOARD}/output?run=${seed.onboardingReadyRunId}`],
    ["Pull requests", () => `${ONBOARD}/prs?run=${seed.onboardingPrsOpenRunId}`],
  ];
  for (const theme of ["light", "dark"] as const) {
    for (const [name, url] of screens) {
      test(`${name} -- ${theme} theme`, async ({ page }, testInfo) => {
        await page.addInitScript((t) => {
          try {
            window.localStorage.setItem("theme", t);
          } catch {
            // ignore
          }
        }, theme);
        await page.goto(url());
        await expect(page.getByRole("heading").first()).toBeVisible();
        await expect(page.locator("main, [role=main], body").first()).toBeVisible();

        const results = await new AxeBuilder({ page }).analyze();
        const description = results.violations
          .map((v) => `[${theme}/${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
          .join("\n");
        expect(results.violations, description).toEqual([]);
      });
    }
  }
});
// ===== end WP-O2 (T152) =====
