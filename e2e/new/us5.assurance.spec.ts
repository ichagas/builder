/**
 * US5 Assurance console (spec 007). Covers WP-A1 (T130): AssuranceLayout,
 * TeamSwitcher and the team portfolio -- NA-01 (team switcher lists the
 * caller's teams, plus every team in the organization for organization
 * admins, D-8) and NA-02 (team portfolio: applications with Standards
 * adoption, mesh reporting status and "not reporting" after 7 days). And
 * WP-A2 (T131): the application page -- NA-03 (repositories grouped by
 * part, each with its latest mesh run's per-check verdicts and the
 * Standards adoption bar) and NA-04 (group actions to send update PRs,
 * with confirmation, and the application's mesh exceptions).
 *
 * WP-A3..A6/O1 extend this file with mesh runs/evidence, packs/policy, All
 * teams and onboarding as their own tests land; T135 (the final 15-repo-seed
 * spec) is the canonical end state -- this is an early slice.
 *
 * Only exists in app/frontend-new (contracts/routes.md: "-- (new, US5,
 * US6)"), so this whole file is APP=new-only, same as shell/axe-shell.spec.ts.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, seed, api, defaultOwner } from "../fixtures";

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

  test("opens the application page from the portfolio (T131, WP-A2)", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}`);
    await expect(page.getByText("Permits API")).toBeVisible();

    // Two "Open →" links exist (one per application) -- scope to Permits
    // API's row via its testid container.
    await page
      .locator('[data-testid="assurance-app-row"]', { hasText: "Permits API" })
      .getByRole("link", { name: /open/i })
      .click();

    await expect(page).toHaveURL(new RegExp(`/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}$`));
    await expect(page.getByRole("heading", { name: "Permits API" })).toBeVisible();
  });
});

test.describe("NA-03: application page", () => {
  test("shows repositories grouped by part, adoption, and per-check mesh verdicts", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}`);

    await expect(page.getByRole("heading", { name: "Permits API" })).toBeVisible();
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-api" })).toBeVisible();
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-worker" })).toBeVisible();

    // Adoption bar: 1 repo on 2026.1 (permits-worker, behind), 1 on 2026.2
    // (permits-api, latest) -- seed.sql's application_repositories rows.
    await expect(page.getByRole("img", { name: /1 on 2026\.1, 1 on 2026\.2/ })).toBeVisible();

    // Grouped by `part` by default: "api" (permits-api) and "worker"
    // (permits-worker) are separate groups.
    await expect(page.getByText(/^api · 1$/)).toBeVisible();
    await expect(page.getByText(/^worker · 1$/)).toBeVisible();

    // permits-worker's latest mesh run (seed.sql, run 832) has a yellow
    // warning -- MeshDots' aria-label names each agent's verdict.
    await expect(page.getByLabel(/Assurance Mesh: Green Pass, Yellow Warning, Red Pass, Blue Skipped/)).toBeVisible();
  });

  test("filters to repositories behind the latest pack (URL-held state)", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}`);
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-api" })).toBeVisible();

    await page.getByRole("button", { name: /^behind/i }).click();
    await expect(page).toHaveURL(/[?&]f=behind/);
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-worker" })).toBeVisible();
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-api" })).not.toBeVisible();

    await page.reload();
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-worker" })).toBeVisible();
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-api" })).not.toBeVisible();
  });

  test("the fresh-findings banner filters to repositories with new findings", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}`);
    // permits-worker's latest run has 1 new finding (seed.sql, run 832).
    await expect(page.getByText(/1 repository has new findings/i)).toBeVisible();

    await page.getByRole("button", { name: /show them/i }).click();
    await expect(page).toHaveURL(/[?&]f=new/);
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-worker" })).toBeVisible();
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-api" })).not.toBeVisible();
  });

  test("lists the application's exceptions", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}`);

    // seed.sql: one exception on permits-worker ("Red recon").
    await page.getByText(/Exceptions · 1/).click();
    await expect(page.getByTestId("assurance-exception-row")).toContainText("e2e-goa/permits-worker");
    await expect(page.getByTestId("assurance-exception-row")).toContainText("Red recon");
  });
});

test.describe("NA-04: group actions and exceptions", () => {
  test("sending update PRs for a group requires confirmation (ActionButton two-step confirm)", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}`);
    await expect(page.getByTestId("assurance-app-repo-row").filter({ hasText: "e2e-goa/permits-worker" })).toBeVisible();

    // permits-worker is behind (2026.1) with no update PR open -- its
    // "worker" group gets a "Send update PR(s)" action.
    const sendButton = page.getByRole("button", { name: /send update prs? \(1\)/i });
    await expect(sendButton).toBeVisible();
    await sendButton.click();

    // First click arms the confirmation (ActionButton's `confirm` copy);
    // the mutation only runs on the second click.
    await expect(page.getByRole("button", { name: /send 1 update prs?\?/i })).toBeVisible();
    await page.getByRole("button", { name: /send 1 update prs?\?/i }).click();

    // POST /applications/:appId/update-prs returns 207 (per-repository
    // results) even when the sandbox's GitHub App isn't configured in this
    // environment, so this only asserts the button leaves its pending
    // state -- not that a PR actually opened (that's GitHub-App-config
    // dependent, out of this WP's E2E scope).
    await expect(sendButton.or(page.getByRole("button", { name: /failed/i }))).not.toHaveAttribute("aria-busy", "true");
  });

  test("requests an exception for a repository", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}`);
    await page.getByText(/Exceptions · 1/).click();

    await page.getByLabel("Rule").fill("Red recon");
    await page.getByLabel("Reason (optional)").fill("Nightly batch job only");
    await page.getByLabel("Expires").fill("2027-06-01");
    await page.getByRole("button", { name: "Request exception" }).click();

    // The new exception appears once the mutation invalidates the
    // application query (contracts/design-system.md: "mutations invalidate
    // the right queries").
    await expect(page.getByText(/Exceptions · 2/)).toBeVisible();
    await expect(page.getByTestId("assurance-exception-row").filter({ hasText: "Nightly batch job only" })).toBeVisible();
  });
});

test.describe("NA-08: Admin -> Integrations", () => {
  test.describe("as a non-admin org member", () => {
    test.use({ mockUser: { id: seed.memberUserId, email: seed.memberEmail, name: seed.memberName } });

    test("sees a no-access state, not the forms", async ({ page }) => {
      // seed.sql: memberUserId is an org member with no user_roles 'admin' row.
      await page.goto("/admin/integrations");
      await expect(page.getByText("Organization admins only")).toBeVisible();
      await expect(page.getByRole("heading", { name: "GitHub App" })).not.toBeVisible();
    });
  });

  test.describe("as an organization admin", () => {
    // These tests write shared org-level state (the org's github_app
    // connection, the organization mesh policy, Permits API's sandbox flag).
    // Snapshot it before each test and put it back afterwards (or delete any
    // connection the test created) so no later spec sees the mutation, e.g.
    // onboarding's import scope depends on the seeded github_app owners.
    interface ConnectionSnapshot {
      id: string;
      displayName: string;
      owners: string[];
    }
    interface PolicySnapshot {
      connections: ConnectionSnapshot[];
      orgModes: Record<string, string>;
      sandbox: boolean;
    }
    let snapshot: PolicySnapshot;

    const policyPath = (scope: string, scopeId: string) => `/api/v1/mesh/policy?scope=${scope}&scopeId=${scopeId}`;
    async function readState(): Promise<PolicySnapshot> {
      const integrations = await api.get<{
        githubAppConnections: Array<{ id: string; displayName: string; scope: { owners?: string[] } }>;
      }>("/api/v1/admin/integrations", defaultOwner);
      const org = await api.get<{ effective: Record<string, string> }>(policyPath("organization", seed.orgId), defaultOwner);
      const appPolicy = await api.get<{ cyberRiskSandbox: boolean }>(policyPath("application", seed.assuranceApp1Id), defaultOwner);
      return {
        connections: integrations.githubAppConnections.map((c) => ({
          id: c.id,
          displayName: c.displayName,
          owners: c.scope.owners ?? [],
        })),
        orgModes: org.effective,
        sandbox: appPolicy.cyberRiskSandbox,
      };
    }

    test.beforeEach(async () => {
      snapshot = await readState();
    });

    test.afterEach(async () => {
      const current = await readState();
      const wasThere = new Set(snapshot.connections.map((c) => c.id));
      for (const c of current.connections) {
        if (!wasThere.has(c.id)) await api.delete(`/api/v1/admin/integrations/${c.id}`, defaultOwner);
      }
      for (const c of snapshot.connections) {
        await api.patch(`/api/v1/admin/integrations/${c.id}`, defaultOwner, { displayName: c.displayName, owners: c.owners });
      }
      for (const [agent, mode] of Object.entries(snapshot.orgModes)) {
        if (current.orgModes[agent] !== mode) {
          await api.put(policyPath("organization", seed.orgId), defaultOwner, { agent, mode });
        }
      }
      if (current.sandbox !== snapshot.sandbox) {
        await api.put(policyPath("application", seed.assuranceApp1Id), defaultOwner, { cyberRiskSandbox: snapshot.sandbox });
      }
    });

    test("shows the platform GitHub App status and this org's Azure DevOps connection", async ({ page }) => {
      await page.goto("/admin/integrations");
      await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "GitHub App" })).toBeVisible();

      // seed.sql's azure_devops connection (id 903).
      await expect(page.getByText("GOA Azure DevOps")).toBeVisible();
      await expect(page.getByText("https://dev.azure.com/e2e-goa")).toBeVisible();
      await expect(page.getByTestId("integrations-azure-connection").getByText("No secret stored")).toBeVisible();
    });

    test("configures the GitHub App connection's owners (main write)", async ({ page }) => {
      await page.goto("/admin/integrations");
      await page.getByLabel("Display name").first().fill("GOA GitHub import");
      await page.getByLabel(/Owners/i).fill("goa-standards");
      await page.getByRole("button", { name: "Save" }).click();

      await expect(page.getByText("GitHub App connection saved")).toBeVisible();
      // A saved github_app connection has no secret at all (BE8) -- its
      // footer still shows the status/secret row, same as Azure DevOps.
      await expect(page.getByTestId("integrations-github-app").getByText("No secret stored")).toBeVisible();

      await page.reload();
      await expect(page.getByLabel("Display name").first()).toHaveValue("GOA GitHub import");
    });

    test("sets the organization-wide mesh policy per check (tighten and loosen -- org admins aren't tighten-only)", async ({ page }) => {
      await page.goto("/admin/integrations");
      const greenSelect = page.getByRole("combobox", { name: "Green" });
      await greenSelect.click();
      await page.getByRole("option", { name: "Block" }).click();
      await expect(page.getByText("Mesh policy updated")).toBeVisible();

      await page.reload();
      await expect(page.getByRole("combobox", { name: "Green" })).toHaveText("Block");

      // Org admins may loosen too (unlike team/app/repo owners, D-15).
      await page.getByRole("combobox", { name: "Green" }).click();
      await page.getByRole("option", { name: "Off" }).click();
      await page.reload();
      await expect(page.getByRole("combobox", { name: "Green" })).toHaveText("Off");
    });

    test("enables the Cyber Risk sandbox for an application (D-17)", async ({ page }) => {
      await page.goto("/admin/integrations");
      await page.getByLabel("Team").click();
      await page.getByRole("option", { name: "Permits Platform" }).click();
      await page.getByLabel("Application").click();
      await page.getByRole("option", { name: "Permits API" }).click();

      const toggle = page.getByRole("switch", { name: /Cyber Risk sandbox for Permits API/i });
      await expect(toggle).not.toBeChecked();
      await toggle.click();
      await expect(page.getByText("Cyber Risk sandbox updated")).toBeVisible();

      await page.reload();
      await page.getByLabel("Team").click();
      await page.getByRole("option", { name: "Permits Platform" }).click();
      await page.getByLabel("Application").click();
      await page.getByRole("option", { name: "Permits API" }).click();
      await expect(page.getByRole("switch", { name: /Cyber Risk sandbox for Permits API/i })).toBeChecked();
    });
  });

  test.describe("Admin -> Integrations axe: zero violations", () => {
    for (const theme of ["light", "dark"] as const) {
      test(`admin integrations -- ${theme} theme`, async ({ page }, testInfo) => {
        await page.addInitScript((t) => {
          try {
            window.localStorage.setItem("theme", t);
          } catch {
            // ignore
          }
        }, theme);
        await page.goto("/admin/integrations");
        await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();

        const results = await new AxeBuilder({ page }).analyze();
        const description = results.violations
          .map((v) => `[${theme}/${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
          .join("\n");
        expect(results.violations, description).toEqual([]);
      });
    }
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

    test(`application page -- ${theme} theme`, async ({ page }, testInfo) => {
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem("theme", t);
        } catch {
          // ignore
        }
      }, theme);
      await page.goto(`/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp1Id}`);
      await expect(page.getByRole("heading", { name: "Permits API" })).toBeVisible();
      // Open the Exceptions disclosure and its create-exception form too,
      // so axe also covers the form controls (T131, WP-A2).
      await page.getByText(/Exceptions ·/).click();

      const results = await new AxeBuilder({ page }).analyze();
      const description = results.violations
        .map((v) => `[${theme}/${testInfo.project.name}] ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
        .join("\n");
      expect(results.violations, description).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// NA-06 packs, policy, exceptions (T133, WP-A4). Written, not run: the batch
// tester runs it. Runs at desktop and mobile (playwright projects).
// ---------------------------------------------------------------------------
test.describe("NA-06 packs, policy, exceptions", () => {
  test("packs page lists the published packs, newest first, with team adoption", async ({ page }) => {
    await page.goto("/assurance/packs");
    await expect(page.getByRole("heading", { name: "Standards packs", level: 1 })).toBeVisible();

    const cards = page.getByTestId("governance-pack-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("2026.2");
    await expect(cards.first()).toContainText("Latest pack");
    // seed.sql: Permits Platform has 2 repos on 2026.2 (api, portal) and 1 on 2026.1 (worker).
    await expect(cards.first()).toContainText("2 repos");
    await expect(cards.nth(1)).toContainText("2026.1");
    await expect(cards.nth(1)).toContainText("1 repo");
  });

  test("the rail links to packs and policy", async ({ page }) => {
    await page.goto(`/assurance/t/${seed.assuranceTeamId}`);
    await page.getByRole("link", { name: "Mesh policy" }).first().click();
    await expect(page).toHaveURL(/\/assurance\/policy/);
    await expect(page.getByRole("heading", { name: "Mesh policy", level: 1 })).toBeVisible();
  });

  test("exceptions tab lists an application's exceptions with an expired marker", async ({ page }) => {
    await page.goto(`/assurance/policy?tab=exceptions&team=${seed.assuranceTeamId}&app=${seed.assuranceApp2Id}`);
    const rows = page.getByTestId("governance-exception-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "static site, no test environment" })).toContainText("e2e-goa/permits-portal");
    await expect(rows.filter({ hasText: "lapsed deviation" })).toContainText(/expired/);
    await expect(page.getByRole("link", { name: "Request an exception" })).toHaveAttribute(
      "href",
      `/assurance/t/${seed.assuranceTeamId}/apps/${seed.assuranceApp2Id}`,
    );
  });

  test.describe("policy changes", () => {
    // Writes the mesh policy of application 813 (Licensing API), which no
    // other spec reads. Put every check back afterwards.
    const policyPath = `/api/v1/mesh/policy?scope=application&scopeId=${seed.assuranceOtherTeamAppId}`;
    let before: Record<string, string>;

    test.beforeEach(async () => {
      const current = await api.get<{ effective: Record<string, string> }>(policyPath, defaultOwner);
      before = current.effective;
    });

    test.afterEach(async () => {
      const current = await api.get<{ effective: Record<string, string> }>(policyPath, defaultOwner);
      for (const [agent, mode] of Object.entries(before)) {
        if (current.effective[agent] !== mode) await api.put(policyPath, defaultOwner, { agent, mode });
      }
    });

    const url = `/assurance/policy?scope=application&team=${seed.assuranceOtherTeamId}&app=${seed.assuranceOtherTeamAppId}`;

    test("tightens a check, and it persists", async ({ page }) => {
      await page.goto(url);
      const red = page.getByRole("combobox", { name: "Red policy mode" });
      await red.selectOption("block");
      await page.getByRole("button", { name: "Apply Red" }).click();
      await expect(page.getByText("Mesh policy updated")).toBeVisible();

      await page.reload();
      await expect(page.getByRole("combobox", { name: "Red policy mode" })).toHaveValue("block");
    });

    test("loosening asks for confirmation first (organization admins may loosen)", async ({ page }) => {
      await api.put(policyPath, defaultOwner, { agent: "blue", mode: "block" });
      await page.goto(url);
      await page.getByRole("combobox", { name: "Blue policy mode" }).selectOption("notify");
      await page.getByRole("button", { name: "Apply Blue" }).click();
      // First click only asks; nothing is written yet.
      await expect(page.getByRole("button", { name: /Loosen Blue/ })).toBeVisible();
      const still = await api.get<{ effective: Record<string, string> }>(policyPath, defaultOwner);
      expect(still.effective.blue).toBe("block");

      await page.getByRole("button", { name: /Loosen Blue/ }).click();
      await expect(page.getByText("Mesh policy updated")).toBeVisible();
      await page.reload();
      await expect(page.getByRole("combobox", { name: "Blue policy mode" })).toHaveValue("notify");
    });
  });

  for (const theme of ["light", "dark"] as const) {
    test(`packs and policy pages have no axe violations -- ${theme}`, async ({ page }, testInfo) => {
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem("theme", t);
        } catch {
          // ignore
        }
      }, theme);
      for (const path of [
        "/assurance/packs",
        `/assurance/policy?scope=team&team=${seed.assuranceTeamId}`,
        `/assurance/policy?tab=exceptions&team=${seed.assuranceTeamId}&app=${seed.assuranceApp2Id}`,
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page }).analyze();
        const description = results.violations
          .map((v) => `[${theme}/${testInfo.project.name}] ${path} ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
          .join("\n");
        expect(results.violations, description).toEqual([]);
      }
    });
  }
});
