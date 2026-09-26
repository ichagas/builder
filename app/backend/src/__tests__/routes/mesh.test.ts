/**
 * Unit tests for the mesh routes (spec 007, epic B2 — WP-BE4, T122).
 *
 * Covers: HMAC ingest (rejection cases, the shared CI test vector, the
 * baseline ratchet, baseline seeding, merged-PR baseline updates), evidence,
 * exceptions, and the policy tighten-only rule.
 */
import express from "express";
import "express-async-errors";
import request from "supertest";
import crypto from "crypto";
import meshRouter from "../../routes/mesh";
import { errorHandler } from "../../middleware/errorHandler";
import { resetSecretResolverForTests } from "../../services/mesh/secretResolver";

jest.mock("../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockBroadcast = jest.fn();
jest.mock("../../websocket", () => ({
  broadcast: (...args: any[]) => mockBroadcast(...args),
}));

const mockOpenIssueForNewFindings = jest.fn();
jest.mock("../../services/mesh/issueService", () => ({
  openIssueForNewFindings: (...args: any[]) => mockOpenIssueForNewFindings(...args),
}));

const mockClientQuery = jest.fn();
const mockDbQuery = jest.fn();
const mockTransaction = jest.fn(async (...args: any[]) => {
  const cb = args[0] as (client: { query: typeof mockClientQuery }) => Promise<any>;
  return cb({ query: mockClientQuery });
});

jest.mock("../../utils/database", () => {
  return {
    __esModule: true,
    default: {
      query: (...args: any[]) => mockDbQuery(...args),
      transaction: (...args: any[]) => mockTransaction(...args),
      healthCheck: jest.fn(),
      getActiveDbPort: jest.fn(),
    },
  };
});

function fakeAuth(userId?: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (userId) {
      req.user = { id: userId, email: "test@test.com" };
    }
    next();
  };
}

// Mirrors index.ts's production wiring: POST /mesh/runs gets a route-scoped
// raw-body parser (2 MiB limit) ahead of the global JSON parser, so
// req.body is the exact bytes for HMAC verification and an oversized report
// is rejected at the parsing stage (413) before the handler ever runs.
// Every other route parses JSON normally.
function createApp(userId?: string) {
  const app = express();
  app.use((req, res, next) => {
    if (req.method === "POST" && req.path === "/mesh/runs") {
      express.raw({ type: "application/json", limit: "2mb" })(req, res, (err: any) => {
        if (err) {
          err.statusCode = err.statusCode || err.status || 500;
          next(err);
          return;
        }
        next();
      });
      return;
    }
    next();
  });
  app.use(express.json());
  app.use(fakeAuth(userId));
  app.use("/mesh", meshRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  mockDbQuery.mockReset();
  mockClientQuery.mockReset();
  mockTransaction.mockClear();
  mockBroadcast.mockReset();
  mockOpenIssueForNewFindings.mockReset();
  mockOpenIssueForNewFindings.mockResolvedValue({ created: false, issueRef: null });
  resetSecretResolverForTests();
  delete process.env.MESH_KEYVAULT_URI;
});

const REPO_ID = "repo-1";
const APPLICATION_ID = "app-1";
const TEAM_ID = "team-1";
const SECRET_REF = "MESH_SECRET_PERMITS_API";
const SECRET_VALUE = "test-secret-do-not-use-in-production";

function repoRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: REPO_ID,
    application_id: APPLICATION_ID,
    default_branch: "main",
    report_secret_ref: SECRET_REF,
    team_id: TEAM_ID,
    onboarded_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function sign(body: string, secret = SECRET_VALUE): string {
  const hex = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${hex}`;
}

function reportBody(overrides: Partial<Record<string, any>> = {}) {
  return {
    repository: "goa/permits-api",
    commit_sha: "abc123def4567890abc123def4567890abcdef1",
    pr_number: 214,
    base_branch: "main",
    pr_state: "open",
    trigger: "pull_request",
    pack_version: "2026.3",
    verdicts: { green: "pass", yellow: "fail", red: "pass", blue: "pass" },
    findings: [
      {
        agent: "yellow",
        rule: "plain-language-07",
        file: "src/errors.ts",
        location: "L42",
        severity: "warn",
        message: "Error message uses an internal code (E1043) instead of plain language.",
        fingerprint: "fd83e152bb694b02eb3289a3614a152dab791e6884af75c7f461a9b64f4a4eb4",
      },
    ],
    new_findings: 1,
    asvs_passed: 280,
    alberta_passed: 62,
    report_url: "https://example.blob.core.windows.net/mesh-reports/permits-api/214/report.json",
    received_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("POST /mesh/runs", () => {
  beforeEach(() => {
    process.env[SECRET_REF] = SECRET_VALUE;
  });

  it("reuses the shared CI test vector (scripts/test-vectors/signature.json) to verify signing", async () => {
    // Same secret/body/header the CI-side test vector documents, confirming
    // this API's HMAC math matches the CI's scripts/lib/sign.js bit-for-bit.
    const body =
      '{"repository":"goa/permits-api","commit_sha":"abc123def4567890abc123def4567890abcdef1","pr_number":214,"base_branch":"main","pr_state":"open","trigger":"pull_request","pack_version":"2026.3","verdicts":{"green":"pass","yellow":"fail","red":"pass","blue":"pass"},"findings":[{"agent":"yellow","rule":"plain-language-07","file":"src/errors.ts","location":"L42","severity":"warn","message":"Error message uses an internal code (E1043) instead of plain language.","fingerprint":"fd83e152bb694b02eb3289a3614a152dab791e6884af75c7f461a9b64f4a4eb4"}],"new_findings":1,"asvs_passed":280,"alberta_passed":62,"report_url":"https://example.blob.core.windows.net/mesh-reports/permits-api/214/report.json","received_at":"2026-09-25T12:00:00.000Z"}';
    const expectedHeader = "sha256=ae0a077643798e60a0e44cdb1182eb0d55ae5152237934baa791a1ed96b92f06";
    expect(sign(body)).toBe(expectedHeader);
  });

  it("401s for an unknown repository", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // repo lookup

    const body = JSON.stringify(reportBody());
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MESH_INGEST_UNAUTHORIZED");
  });

  it("401s for a missing signature header", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });

    const res = await request(createApp()).post("/mesh/runs").send(reportBody());

    expect(res.status).toBe(401);
  });

  it("401s for a bad signature", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });

    const body = JSON.stringify(reportBody());
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", "sha256=" + "0".repeat(64))
      .send(body);

    expect(res.status).toBe(401);
  });

  it("401s when the resolved secret doesn't match (wrong repository secret)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });

    const body = JSON.stringify(reportBody());
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body, "a-different-secret"))
      .send(body);

    expect(res.status).toBe(401);
  });

  it("401s when the repository has no report_secret_ref configured", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow({ report_secret_ref: null })] });

    const body = JSON.stringify(reportBody());
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(401);
  });

  it("413s an oversized body", async () => {
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", "sha256=" + "0".repeat(64))
      .send({ repository: "goa/permits-api", padding: "x".repeat(3 * 1024 * 1024) });

    expect(res.status).toBe(413);
  });

  it("rejects a report whose base_branch isn't the repository's default branch", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow({ default_branch: "develop" })] });

    const body = JSON.stringify(reportBody({ base_branch: "main" }));
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(400);
  });

  it("rejects a stale/replayed report (received_at too old)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });

    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const body = JSON.stringify(reportBody({ received_at: stale }));
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(409);
  });

  it("422s on a malformed report", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });

    const body = JSON.stringify(reportBody({ verdicts: { green: "pass" } })); // missing agents
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(422);
  });

  it("422s a report_url that isn't https (rejects javascript:/data:/http:)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });

    const body = JSON.stringify(reportBody({ report_url: "javascript:alert(1)" }));
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(422);
  });

  it("422s a plain http:// report_url", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });

    const body = JSON.stringify(reportBody({ report_url: "http://example.blob.core.windows.net/report.json" }));
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(422);
  });

  it("413s an oversized body before the handler ever runs (no repo lookup, no signature check)", async () => {
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", "sha256=" + "0".repeat(64))
      .send({ repository: "goa/permits-api", padding: "x".repeat(3 * 1024 * 1024) });

    expect(res.status).toBe(413);
    // The route-scoped raw parser rejects it before any DB call.
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it("accepts a valid signed report, ratchets against the baseline, and returns new_findings_by_agent", async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [repoRow()] }) // repo lookup
      .mockResolvedValueOnce({ rows: [] }); // baseline fingerprints (none known yet)

    // resolveEffectivePolicy/resolveEffectiveSandbox issue their own db.query
    // calls (via scope-chain resolution) after the transaction; stub every
    // remaining call generically.
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: "run-1" }] }); // INSERT mesh_runs
    mockClientQuery.mockResolvedValue({ rows: [] });

    const body = JSON.stringify(reportBody());
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.run_id).toBe("run-1");
    expect(res.body.new_findings_by_agent).toEqual({ green: 0, yellow: 1, red: 0, blue: 0 });
    expect(res.body.policy).toBeDefined();
    expect(mockBroadcast).toHaveBeenCalledWith(
      `team-${TEAM_ID}`,
      "mesh_run_received",
      expect.objectContaining({ runId: "run-1" }),
    );
  });

  it("does not count a finding already in the baseline as new", async () => {
    const fingerprint = "fd83e152bb694b02eb3289a3614a152dab791e6884af75c7f461a9b64f4a4eb4";
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ fingerprint }] }); // already baselined
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: "run-2" }] });
    mockClientQuery.mockResolvedValue({ rows: [] });

    const body = JSON.stringify(reportBody());
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.new_findings_by_agent).toEqual({ green: 0, yellow: 0, red: 0, blue: 0 });
  });

  it("a baseline-trigger run seeds the baseline and reports zero new findings", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no existing baseline
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: "run-3" }] });
    mockClientQuery.mockResolvedValue({ rows: [] });

    const body = JSON.stringify(reportBody({ trigger: "baseline", pr_state: "open" }));
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.new_findings_by_agent).toEqual({ green: 0, yellow: 0, red: 0, blue: 0 });
    // baseline insert executed on the transaction client
    expect(mockClientQuery.mock.calls.some((c) => String(c[0]).includes("INSERT INTO public.mesh_baselines"))).toBe(
      true,
    );
  });

  it("a merged PR's findings are folded into the baseline", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] });
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: "run-4" }] });
    mockClientQuery.mockResolvedValue({ rows: [] });

    const body = JSON.stringify(reportBody({ pr_state: "merged" }));
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(201);
    expect(mockClientQuery.mock.calls.some((c) => String(c[0]).includes("INSERT INTO public.mesh_baselines"))).toBe(
      true,
    );
    expect(mockBroadcast).toHaveBeenCalledWith(`team-${TEAM_ID}`, "pr_state_changed", expect.anything());
  });

  it("triggers automatic issue filing when the effective policy is 'issue' and there are new findings", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [repoRow()] }); // repo lookup
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // baseline fingerprints
    // resolveEffectiveMode is called once per agent (4x) inside resolveEffectivePolicy;
    // default with no explicit rows resolves to DEFAULT_MODE ("issue").
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: "run-5" }] });
    mockClientQuery.mockResolvedValue({ rows: [] });
    mockOpenIssueForNewFindings.mockResolvedValue({ created: true, issueRef: "github:goa/permits-api#1" });

    const body = JSON.stringify(reportBody());
    const res = await request(createApp())
      .post("/mesh/runs")
      .set("Content-Type", "application/json")
      .set("X-Pronghorn-Signature", sign(body))
      .send(body);

    expect(res.status).toBe(201);
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockOpenIssueForNewFindings).toHaveBeenCalledWith("run-5");
  });
});

describe("GET /mesh/runs/:runId", () => {
  it("401s when unauthenticated", async () => {
    const res = await request(createApp()).get("/mesh/runs/run-1");
    expect(res.status).toBe(401);
  });

  it("404s for an unknown run", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp("user-1")).get("/mesh/runs/run-1");
    expect(res.status).toBe(404);
  });

  it("403s for a user outside the owning team", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "run-1", application_id: APPLICATION_ID }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // checkApplicationAccess: applications lookup
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // getProfileId -> none
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // getUserOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin -> false
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // getTeamRole -> null

    const res = await request(createApp("user-outsider")).get("/mesh/runs/run-1");
    expect(res.status).toBe(403);
  });
});

describe("GET/POST /mesh/exceptions", () => {
  it("requires repositoryId or applicationId", async () => {
    const res = await request(createApp("user-1")).get("/mesh/exceptions");
    expect(res.status).toBe(400);
  });

  it("lists exceptions for an authorized application", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // checkApplicationAccess
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "member" }] }); // getTeamRole
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "exc-1", repository_id: REPO_ID, rule: "Red recon" }] });

    const res = await request(createApp("user-1")).get(`/mesh/exceptions?applicationId=${APPLICATION_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("creates an exception for an authorized member", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ application_id: APPLICATION_ID }] }); // repo -> application
    mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // checkApplicationAccess
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "member" }] }); // getTeamRole
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId (for approved_by)
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "exc-1" }] }); // insert

    const res = await request(createApp("user-1"))
      .post("/mesh/exceptions")
      .send({ repositoryId: REPO_ID, rule: "Red recon", expiresAt: "2027-01-01T00:00:00Z" });

    expect(res.status).toBe(201);
  });
});

describe("PUT /mesh/policy (tighten-only rule)", () => {
  it("403s for a plain team member", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId (checkTeamAccess)
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "member" }] }); // getTeamRole

    const res = await request(createApp("user-1"))
      .put(`/mesh/policy?scope=team&scopeId=${TEAM_ID}`)
      .send({ agent: "blue", mode: "block" });

    expect(res.status).toBe(403);
  });

  it("allows a team owner to tighten (issue -> block)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] }); // getTeamRole
    // resolveEffectiveMode -> resolveScopeChain(team) -> teams lookup, then mesh_policy lookup(s)
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // resolveScopeChain: teams
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // mesh_policy at team scope: none -> falls through
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // mesh_policy at org scope: none -> default 'issue'
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow: select existing -> none
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow: insert
    mockDbQuery.mockResolvedValue({ rows: [] }); // remaining resolveEffectivePolicy/-Sandbox calls

    const res = await request(createApp("user-1"))
      .put(`/mesh/policy?scope=team&scopeId=${TEAM_ID}`)
      .send({ agent: "blue", mode: "block" });

    expect(res.status).toBe(200);
  });

  it("403s a team owner trying to loosen (issue -> notify)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] }); // getTeamRole
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // resolveScopeChain: teams
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // mesh_policy team scope: none
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // mesh_policy org scope: none -> default 'issue'

    const res = await request(createApp("user-1"))
      .put(`/mesh/policy?scope=team&scopeId=${TEAM_ID}`)
      .send({ agent: "blue", mode: "notify" });

    expect(res.status).toBe(403);
  });

  it("allows an organization admin to loosen freely", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "org-admin" }] }); // isOrgAdmin (organization scope)
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow select
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow insert
    mockDbQuery.mockResolvedValue({ rows: [] }); // remaining effective policy/sandbox lookups

    const res = await request(createApp("admin-1"))
      .put(`/mesh/policy?scope=organization&scopeId=org-1`)
      .send({ agent: "blue", mode: "off" });

    expect(res.status).toBe(200);
  });

  it("allows an organization admin to loosen at team scope too (isOrgAdmin bypasses tighten-only everywhere, not just at organization scope)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId (checkTeamAccess)
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "admin-row" }] }); // isOrgAdmin -> true
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] }); // getTeamRole
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow select
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow insert
    mockDbQuery.mockResolvedValue({ rows: [] }); // remaining effective policy/sandbox lookups

    const res = await request(createApp("admin-1"))
      .put(`/mesh/policy?scope=team&scopeId=${TEAM_ID}`)
      .send({ agent: "blue", mode: "notify" }); // a loosen (block/issue -> notify), only legal for an org admin

    expect(res.status).toBe(200);
  });

  it("allows an application owner to tighten (application scope, mirrors the team-scope rule)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // checkApplicationAccess: applications lookup
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin -> false
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] }); // getTeamRole
    // resolveEffectiveMode -> resolveScopeChain(application) -> applications lookup, then team chain
    mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // resolveScopeChain: applications
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // resolveScopeChain: teams
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // mesh_policy at application scope: none
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // mesh_policy at team scope: none
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // mesh_policy at org scope: none -> default 'issue'
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow select
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow insert
    mockDbQuery.mockResolvedValue({ rows: [] }); // remaining effective policy/sandbox lookups

    const res = await request(createApp("user-1"))
      .put(`/mesh/policy?scope=application&scopeId=${APPLICATION_ID}`)
      .send({ agent: "red", mode: "block" }); // issue -> block is a tighten

    expect(res.status).toBe(200);
  });

  it("403s a repository owner trying to loosen (repository scope)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ application_id: APPLICATION_ID }] }); // checkPolicyScopeAccess: repo -> application
    mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // checkApplicationAccess: applications lookup
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
    mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin -> false
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] }); // getTeamRole
    // resolveEffectiveMode -> resolveScopeChain(repository) -> repo, application, team, org
    mockDbQuery.mockResolvedValueOnce({ rows: [{ application_id: APPLICATION_ID }] }); // resolveScopeChain: application_repositories
    mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // resolveScopeChain: applications
    mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // resolveScopeChain: teams
    mockDbQuery.mockResolvedValueOnce({ rows: [{ mode: "block" }] }); // mesh_policy at repository scope: explicit "block"

    const res = await request(createApp("user-1"))
      .put(`/mesh/policy?scope=repository&scopeId=${REPO_ID}`)
      .send({ agent: "green", mode: "notify" }); // block -> notify is a loosen

    expect(res.status).toBe(403);
  });

  it("404s when the policy scope doesn't resolve (unknown repository id)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // repo -> application lookup: none

    const res = await request(createApp("user-1"))
      .put(`/mesh/policy?scope=repository&scopeId=does-not-exist`)
      .send({ agent: "green", mode: "block" });

    expect(res.status).toBe(404);
  });

  describe("cyberRiskSandbox (D-17): same tighten-only rule, enable-only for non-admins", () => {
    it("400s cyberRiskSandbox at team/organization scope (only application/repository may set it)", async () => {
      const res = await request(createApp("user-1"))
        .put(`/mesh/policy?scope=team&scopeId=${TEAM_ID}`)
        .send({ cyberRiskSandbox: true });

      expect(res.status).toBe(400);
    });

    it("allows an application owner to enable the sandbox (false -> true)", async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // checkApplicationAccess: applications lookup
      mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
      mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
      mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
      mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin -> false
      mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] }); // getTeamRole
      // resolveEffectiveSandbox -> resolveScopeChain(application) -> applications, teams; only application/repository links are queried
      mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // resolveScopeChain: applications
      mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // resolveScopeChain: teams
      mockDbQuery.mockResolvedValueOnce({ rows: [{ enabled: false }] }); // mesh_policy sandbox at application scope: currently off
      mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow select
      mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow insert
      mockDbQuery.mockResolvedValue({ rows: [] }); // remaining effective policy/sandbox lookups

      const res = await request(createApp("user-1"))
        .put(`/mesh/policy?scope=application&scopeId=${APPLICATION_ID}`)
        .send({ cyberRiskSandbox: true });

      expect(res.status).toBe(200);
    });

    it("403s an application owner trying to disable an already-enabled sandbox", async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // checkApplicationAccess: applications lookup
      mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
      mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
      mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
      mockDbQuery.mockResolvedValueOnce({ rows: [] }); // isOrgAdmin -> false
      mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] }); // getTeamRole
      mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // resolveScopeChain: applications
      mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // resolveScopeChain: teams
      mockDbQuery.mockResolvedValueOnce({ rows: [{ enabled: true }] }); // mesh_policy sandbox at application scope: currently ON

      const res = await request(createApp("user-1"))
        .put(`/mesh/policy?scope=application&scopeId=${APPLICATION_ID}`)
        .send({ cyberRiskSandbox: false });

      expect(res.status).toBe(403);
    });

    it("allows an organization admin to disable the sandbox freely", async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ team_id: TEAM_ID }] }); // checkApplicationAccess: applications lookup
      mockDbQuery.mockResolvedValueOnce({ rows: [{ organization_id: "org-1" }] }); // getTeamOrgId
      mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "profile-1" }] }); // getProfileId
      mockDbQuery.mockResolvedValueOnce({ rows: [{ org_id: "org-1" }] }); // getUserOrgId
      mockDbQuery.mockResolvedValueOnce({ rows: [{ id: "admin-row" }] }); // isOrgAdmin -> true
      mockDbQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] }); // getTeamRole (irrelevant, isOrgAdmin bypasses)
      mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow select
      mockDbQuery.mockResolvedValueOnce({ rows: [] }); // upsertPolicyRow insert
      mockDbQuery.mockResolvedValue({ rows: [] }); // remaining effective policy/sandbox lookups

      const res = await request(createApp("admin-1"))
        .put(`/mesh/policy?scope=application&scopeId=${APPLICATION_ID}`)
        .send({ cyberRiskSandbox: false });

      expect(res.status).toBe(200);
    });
  });
});
