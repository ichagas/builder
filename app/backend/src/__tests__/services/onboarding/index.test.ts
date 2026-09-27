/**
 * Unit tests for the onboarding orchestration service (spec 007, WP-BE5).
 *
 * Focus: authorization (403/404), the run state machine (409 on invalid
 * transitions), that pull requests can never be opened without an explicit
 * `confirm: true` and only once the run is `ready`, and that confirming
 * twice is idempotent (no duplicate PRs, no duplicate state transition).
 */
jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../../utils/database", () => {
  const queryFn = jest.fn();
  // The run lock (`withRunLock`) just needs a client whose `.query` is
  // observable; route it through the same `query` mock so existing
  // SQL-substring assertions also see queries issued "inside" the
  // transaction (e.g. the advisory lock, or application inserts).
  const transactionFn = jest.fn((callback: (client: { query: jest.Mock }) => Promise<unknown>) => callback({ query: queryFn }));
  return {
    __esModule: true,
    default: { query: queryFn, transaction: transactionFn },
  };
});

jest.mock("../../../services/teams/authorization", () => ({
  checkTeamAccess: jest.fn(),
  getProfileId: jest.fn(),
  getTeamOrgId: jest.fn(),
}));

jest.mock("../../../services/onboarding/repository", () => {
  const actual = jest.requireActual("../../../services/onboarding/repository");
  return {
    ...actual,
    createRun: jest.fn(),
    getRunById: jest.fn(),
    listRepositoriesForRun: jest.fn(),
    replaceRunRepositories: jest.fn(),
    updateRun: jest.fn(),
    updateRunRepositoryByFullName: jest.fn(),
    claimRunTransition: jest.fn(),
    claimPrLease: jest.fn(),
    renewPrLease: jest.fn(),
    releasePrLease: jest.fn(),
  };
});

jest.mock("../../../services/onboarding/githubImport", () => ({
  listGitHubRepositories: jest.fn(),
}));

jest.mock("../../../services/onboarding/azureImport", () => ({
  listAzureDevOpsRepositories: jest.fn(),
}));

jest.mock("../../../services/integrations", () => {
  const actual = jest.requireActual("../../../services/integrations");
  return { ...actual, getDefaultConnectionForProvider: jest.fn(), getConnectionForOrg: jest.fn(), getConnection: jest.fn() };
});

jest.mock("../../../services/onboarding/pullRequests", () => ({
  openRepositoryPullRequest: jest.fn(),
}));

jest.mock("../../../services/onboarding/realtime", () => ({
  broadcastOnboardingProgress: jest.fn(),
  onboardingChannel: jest.fn((runId: string) => `onboarding-${runId}`),
}));

import db from "../../../utils/database";
import { checkTeamAccess, getProfileId, getTeamOrgId } from "../../../services/teams/authorization";
import * as repo from "../../../services/onboarding/repository";
import { openRepositoryPullRequest } from "../../../services/onboarding/pullRequests";
import { setJobDispatcher, resetJobDispatcher, JobDispatcher, JobResult } from "../../../services/onboarding/jobDispatcher";
import { listGitHubRepositories } from "../../../services/onboarding/githubImport";
import { listAzureDevOpsRepositories } from "../../../services/onboarding/azureImport";
import { getDefaultConnectionForProvider, getConnectionForOrg, getConnection } from "../../../services/integrations";
import { broadcastOnboardingProgress } from "../../../services/onboarding/realtime";
import * as onboarding from "../../../services/onboarding";

const mockCheckTeamAccess = checkTeamAccess as jest.Mock;
const mockGetProfileId = getProfileId as jest.Mock;
const mockGetTeamOrgId = getTeamOrgId as jest.Mock;
const mockCreateRun = repo.createRun as jest.Mock;
const mockGetRunById = repo.getRunById as jest.Mock;
const mockListRepos = repo.listRepositoriesForRun as jest.Mock;
const mockReplaceRepos = repo.replaceRunRepositories as jest.Mock;
const mockUpdateRun = repo.updateRun as jest.Mock;
const mockUpdateRepo = repo.updateRunRepositoryByFullName as jest.Mock;
const mockClaimRunTransition = repo.claimRunTransition as jest.Mock;
const mockClaimPrLease = repo.claimPrLease as jest.Mock;
const mockReleasePrLease = repo.releasePrLease as jest.Mock;
const mockRenewPrLease = repo.renewPrLease as jest.Mock;
const mockOpenPr = openRepositoryPullRequest as jest.Mock;
const mockDbQuery = db.query as jest.Mock;
const mockDbTransaction = db.transaction as jest.Mock;
const mockListGitHubRepositories = listGitHubRepositories as jest.Mock;
const mockListAzureDevOpsRepositories = listAzureDevOpsRepositories as jest.Mock;
const mockGetDefaultConnectionForProvider = getDefaultConnectionForProvider as jest.Mock;
const mockGetConnectionForOrg = getConnectionForOrg as jest.Mock;
const mockGetConnection = getConnection as jest.Mock;
const mockBroadcastOnboardingProgress = broadcastOnboardingProgress as jest.Mock;

const USER_ID = "user-1";
const TEAM_ID = "team-1";
const RUN_ID = "run-1";

function baseRun(overrides: Partial<any> = {}) {
  return {
    id: RUN_ID,
    team_id: TEAM_ID,
    application_name: "Permits API",
    application_id: null,
    pack_version: "2026.3",
    status: "draft",
    step: "team",
    job_execution_id: null,
    log_blob: null,
    connection_id: null,
    started_by: "profile-1",
    created_at: "now",
    updated_at: "now",
    ...overrides,
  };
}

function authorizedAccess() {
  return { found: true, authorized: true, role: "owner", isOrgAdmin: false, organizationId: "org-1" };
}

/** A deterministic dispatcher test double: resolves immediately, invokes onComplete only when `complete()` is called. */
function controlledDispatcher(): JobDispatcher & { complete: (result: JobResult) => Promise<void> } {
  let savedCallback: ((r: JobResult) => Promise<void>) | null = null;
  return {
    dispatch: jest.fn(async (_input, onComplete) => {
      savedCallback = onComplete;
      return { jobExecutionId: "job-exec-1" };
    }),
    cancel: jest.fn(async () => {}),
    complete: async (result: JobResult) => {
      if (!savedCallback) throw new Error("dispatch() was not called yet");
      await savedCallback(result);
    },
  };
}

/**
 * org-1's configured repository scope (fix round 3, item 6): GitHub owners
 * ["goa"] via its github_app connection, Azure DevOps organization
 * "contoso" via its azure_devops connection.
 */
function installOrgScope(opts: { githubOwners?: string[] | null; azureOrgUrl?: string | null } = {}) {
  const githubOwners = opts.githubOwners === undefined ? ["goa"] : opts.githubOwners;
  const azureOrgUrl = opts.azureOrgUrl === undefined ? "https://dev.azure.com/contoso" : opts.azureOrgUrl;
  mockGetDefaultConnectionForProvider.mockImplementation(async (_org: string, provider: string) =>
    provider === "github_app" && githubOwners ? { id: "gh-conn", provider, scope: { owners: githubOwners } } : null
  );
  mockGetConnection.mockImplementation(async (_org: string, provider: string) => {
    if (provider !== "azure_devops" || !azureOrgUrl) throw new Error("No azure_devops integration is configured");
    return { id: "ado-conn", provider, scope: { organizationUrl: azureOrgUrl } };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  installOrgScope();
  mockGetTeamOrgId.mockResolvedValue("org-1");
  // SQL-aware default: pack version lookups get a version row; anything
  // else (notably getExistingRegistration's cross-tenant lookup, fix round
  // 2 item 1) gets no rows, i.e. "nothing registered yet" — never a bogus
  // truthy row that would make every repository look already-registered.
  mockDbQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT version FROM public.standards_packs")) return { rows: [{ version: "2026.3" }] };
    if (sql.includes("INSERT INTO public.applications")) return { rows: [{ id: "app-1" }] };
    // The guarded upsert (fix round 3, item 3) RETURNs the row when it
    // actually linked it; 0 rows means "blocked".
    if (sql.includes("INSERT INTO public.application_repositories")) return { rows: [{ application_id: "app-1" }] };
    return { rows: [] };
  });
});

afterEach(() => {
  resetJobDispatcher();
});

describe("startDraftRun", () => {
  it("rejects a caller who isn't a member of the team (403)", async () => {
    mockCheckTeamAccess.mockResolvedValue({ found: true, authorized: false, role: null, isOrgAdmin: false, organizationId: "org-1" });

    await expect(
      onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: "Permits API" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("404s for a team that doesn't exist", async () => {
    mockCheckTeamAccess.mockResolvedValue({ found: false, authorized: false, role: null, isOrgAdmin: false, organizationId: null });

    await expect(
      onboarding.startDraftRun(USER_ID, { teamId: "nope", applicationName: "Permits API" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("validates required fields (400/422)", async () => {
    await expect(onboarding.startDraftRun(USER_ID, { teamId: "", applicationName: "x" } as any)).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: "" } as any)).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("403s when the caller's account has no profile", async () => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockGetProfileId.mockResolvedValue(null);

    await expect(
      onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: "Permits API" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("422s an applicationName over 200 characters (fix round 1, item 7)", async () => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    await expect(
      onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: "x".repeat(201) })
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("422s an applicationName containing control characters (fix round 1, item 7)", async () => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    await expect(
      onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: "Permits\x00API" })
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("accepts an applicationName at exactly the 200-character limit", async () => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockGetProfileId.mockResolvedValue("profile-1");
    mockCreateRun.mockResolvedValue(baseRun());
    mockListRepos.mockResolvedValue([]);

    const name = "x".repeat(200);
    await onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: name });

    expect(mockCreateRun).toHaveBeenCalledWith(expect.objectContaining({ applicationName: name }));
  });

  it("422s a non-string/empty connectionId (fix round 2, item 10)", async () => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());

    await expect(
      onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: "Permits API", connectionId: "" as any })
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("404s when connectionId doesn't belong to the team's organization (fix round 2, item 10)", async () => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockGetConnectionForOrg.mockResolvedValue(null);

    await expect(
      onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: "Permits API", connectionId: "conn-other-org" })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(mockGetConnectionForOrg).toHaveBeenCalledWith("conn-other-org", "org-1");
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("accepts a connectionId that belongs to the team's own organization", async () => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockGetConnectionForOrg.mockResolvedValue({ id: "conn-1", organization_id: "org-1" });
    mockGetProfileId.mockResolvedValue("profile-1");
    mockCreateRun.mockResolvedValue(baseRun({ connection_id: "conn-1" }));
    mockListRepos.mockResolvedValue([]);

    await onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: "Permits API", connectionId: "conn-1" });

    expect(mockCreateRun).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "conn-1" }));
  });

  it("creates a draft run for an authorized team member", async () => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockGetProfileId.mockResolvedValue("profile-1");
    mockCreateRun.mockResolvedValue(baseRun());
    mockListRepos.mockResolvedValue([]);

    const run = await onboarding.startDraftRun(USER_ID, { teamId: TEAM_ID, applicationName: "Permits API" });

    expect(run.status).toBe("draft");
    expect(run.step).toBe("team");
    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: TEAM_ID, applicationName: "Permits API", startedBy: "profile-1", packVersion: "2026.3" })
    );
  });
});

describe("getRun / access control", () => {
  it("404s for a run that doesn't exist", async () => {
    mockGetRunById.mockResolvedValue(null);
    await expect(onboarding.getRun(USER_ID, "missing")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("403s for a run belonging to a team the caller isn't in", async () => {
    mockGetRunById.mockResolvedValue(baseRun());
    mockCheckTeamAccess.mockResolvedValue({ found: true, authorized: false, role: null, isOrgAdmin: false, organizationId: "org-1" });

    await expect(onboarding.getRun(USER_ID, RUN_ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns the run with its repositories for an authorized caller", async () => {
    mockGetRunById.mockResolvedValue(baseRun());
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockListRepos.mockResolvedValue([{ id: "r1", full_name: "goa/permits-api", review: {} }]);

    const view = await onboarding.getRun(USER_ID, RUN_ID);
    expect(view.repositories).toHaveLength(1);
    expect(view.warnings).toEqual([]);
  });

  it("surfaces a persisted per-repository prError as a warning (fix round 1, item 10)", async () => {
    mockGetRunById.mockResolvedValue(baseRun());
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockListRepos.mockResolvedValue([
      { id: "r1", full_name: "goa/permits-api", review: { prError: "could not open the pull request (see server logs for details)" } },
      { id: "r2", full_name: "goa/health-portal", review: {} },
    ]);

    const view = await onboarding.getRun(USER_ID, RUN_ID);
    expect(view.warnings).toEqual(["goa/permits-api: could not open the pull request (see server logs for details)"]);
  });
});

describe("listImportableGitHubRepositories — fix round 1, item 6 (cross-org isolation)", () => {
  beforeEach(() => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockGetTeamOrgId.mockResolvedValue("org-1");
  });

  it("422s when teamId is missing", async () => {
    await expect(onboarding.listImportableGitHubRepositories(USER_ID, { teamId: "" } as any)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(mockListGitHubRepositories).not.toHaveBeenCalled();
  });

  it("403s for a caller who isn't a member of the team", async () => {
    mockCheckTeamAccess.mockResolvedValue({ found: true, authorized: false, role: null, isOrgAdmin: false, organizationId: "org-1" });
    await expect(
      onboarding.listImportableGitHubRepositories(USER_ID, { teamId: TEAM_ID })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns an empty list when the organization has no github_app connection configured, without ever calling GitHub", async () => {
    mockGetDefaultConnectionForProvider.mockResolvedValue(null);

    const repos = await onboarding.listImportableGitHubRepositories(USER_ID, { teamId: TEAM_ID });

    expect(repos).toEqual([]);
    expect(mockListGitHubRepositories).not.toHaveBeenCalled();
  });

  it("returns an empty list when the connection's scope names no owner", async () => {
    mockGetDefaultConnectionForProvider.mockResolvedValue({ scope: {} });

    const repos = await onboarding.listImportableGitHubRepositories(USER_ID, { teamId: TEAM_ID });

    expect(repos).toEqual([]);
    expect(mockListGitHubRepositories).not.toHaveBeenCalled();
  });

  it("only lists repositories for the organization's configured owner — a client-supplied org is never honored", async () => {
    mockGetDefaultConnectionForProvider.mockResolvedValue({ scope: { owner: "goa" } });
    mockListGitHubRepositories.mockResolvedValue([{ fullName: "goa/permits-api" }]);

    const repos = await onboarding.listImportableGitHubRepositories(USER_ID, {
      teamId: TEAM_ID,
      // Even if a caller's raw query included another org, nothing here
      // accepts it — only `teamId` is ever read by the route/service.
      query: "permits",
    } as any);

    expect(mockListGitHubRepositories).toHaveBeenCalledWith({ owners: ["goa"], query: "permits" });
    expect(repos).toEqual([{ fullName: "goa/permits-api" }]);
  });

  it("queries every configured owner in a single call (fix round 2, item 8: one pagination pass, not one per owner)", async () => {
    mockGetDefaultConnectionForProvider.mockResolvedValue({ scope: { owners: ["goa", "goa-labs"] } });
    mockListGitHubRepositories.mockImplementation(async ({ owners }: { owners: string[] }) =>
      owners.map((org) => ({ fullName: `${org}/repo` }))
    );

    const repos = await onboarding.listImportableGitHubRepositories(USER_ID, { teamId: TEAM_ID });

    expect(mockListGitHubRepositories).toHaveBeenCalledTimes(1);
    expect(mockListGitHubRepositories).toHaveBeenCalledWith({ owners: ["goa", "goa-labs"], query: undefined });

    expect(repos.map((r) => r.fullName).sort()).toEqual(["goa-labs/repo", "goa/repo"]);
  });
});

describe("listImportableAzureRepositories", () => {
  beforeEach(() => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockGetTeamOrgId.mockResolvedValue("org-1");
  });

  it("422s when teamId is missing", async () => {
    await expect(onboarding.listImportableAzureRepositories(USER_ID, { teamId: "" } as any)).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("403s for a caller who isn't a member of the team", async () => {
    mockCheckTeamAccess.mockResolvedValue({ found: true, authorized: false, role: null, isOrgAdmin: false, organizationId: "org-1" });
    await expect(
      onboarding.listImportableAzureRepositories(USER_ID, { teamId: TEAM_ID })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("derives the organization from teamId, never a client-supplied value, and forwards connectionId/query", async () => {
    mockListAzureDevOpsRepositories.mockResolvedValue([{ fullName: "contoso/MyProject/permits-api" }]);

    const repos = await onboarding.listImportableAzureRepositories(USER_ID, {
      teamId: TEAM_ID,
      connectionId: "conn-1",
      query: "permits",
    });

    expect(mockListAzureDevOpsRepositories).toHaveBeenCalledWith("org-1", "conn-1", "permits");
    expect(repos).toEqual([{ fullName: "contoso/MyProject/permits-api" }]);
  });

  it("surfaces a missing/misconfigured connection as a 400, not a 500", async () => {
    mockListAzureDevOpsRepositories.mockRejectedValue(new Error("No azure_devops integration is configured for this organization"));

    await expect(
      onboarding.listImportableAzureRepositories(USER_ID, { teamId: TEAM_ID })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("setRunRepositories", () => {
  beforeEach(() => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
  });

  it("400/422s an empty selection", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    await expect(onboarding.setRunRepositories(USER_ID, RUN_ID, [])).rejects.toMatchObject({ statusCode: 422 });
  });

  it("422s more than 200 repositories (fix round 1, item 7)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    const repos = Array.from({ length: 201 }, (_, i) => ({ fullName: `goa/repo-${i}` }));
    await expect(onboarding.setRunRepositories(USER_ID, RUN_ID, repos)).rejects.toMatchObject({ statusCode: 422 });
    expect(mockReplaceRepos).not.toHaveBeenCalled();
  });

  it("409s once the run is no longer draft", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "running" }));
    await expect(
      onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "goa/permits-api" }])
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockReplaceRepos).not.toHaveBeenCalled();
  });

  it("422s a repository entry whose fullName isn't \"org/repo\"", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    await expect(
      onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "not-a-valid-full-name" }])
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(mockReplaceRepos).not.toHaveBeenCalled();
  });

  it.each([
    ["four segments", "a/b/c/d"],
    ["an empty segment", "goa//permits-api"],
    ["a path-traversal repo", "goa/.."],
    ["a forbidden character", "contoso/Pro:ject/repo"],
  ])("422s a repository fullName with %s (shared full_name parser)", async (_label, fullName) => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    await expect(onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName }])).rejects.toMatchObject({ statusCode: 422 });
    expect(mockReplaceRepos).not.toHaveBeenCalled();
  });

  it("accepts an Azure Repos <adoOrg>/<project>/<repo> fullName", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    mockReplaceRepos.mockResolvedValue([]);
    mockUpdateRun.mockResolvedValue(baseRun({ status: "draft", step: "connect" }));
    mockListRepos.mockResolvedValue([]);

    await onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "contoso/My Project/permits-api" }]);

    expect(mockReplaceRepos).toHaveBeenCalledWith(RUN_ID, [{ fullName: "contoso/My Project/permits-api", selected: true }]);
  });

  describe("organization scope (fix round 3, item 6 — cross-org selection)", () => {
    beforeEach(() => {
      mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
      mockReplaceRepos.mockResolvedValue([]);
      mockUpdateRun.mockResolvedValue(baseRun({ status: "draft", step: "connect" }));
      mockListRepos.mockResolvedValue([]);
    });

    it("403s a GitHub repository owned by another organization's login (shared installation), storing nothing", async () => {
      await expect(
        onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "goa/permits-api" }, { fullName: "other-tenant/payroll" }])
      ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("other-tenant/payroll") });
      expect(mockReplaceRepos).not.toHaveBeenCalled();
      expect(mockUpdateRun).not.toHaveBeenCalled();
      // Scope is the team's organization's own github_app connection.
      expect(mockGetDefaultConnectionForProvider).toHaveBeenCalledWith("org-1", "github_app");
    });

    it("403s an unselected out-of-scope entry too (nothing outside the scope is stored)", async () => {
      await expect(
        onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "other-tenant/payroll", selected: false }])
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockReplaceRepos).not.toHaveBeenCalled();
    });

    it("403s any GitHub repository when the organization has no github_app connection", async () => {
      installOrgScope({ githubOwners: null });
      await expect(onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "goa/permits-api" }])).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining("no GitHub connection"),
      });
      expect(mockReplaceRepos).not.toHaveBeenCalled();
    });

    it("accepts an in-scope owner case-insensitively", async () => {
      await onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "GoA/permits-api" }]);
      expect(mockReplaceRepos).toHaveBeenCalledWith(RUN_ID, [{ fullName: "GoA/permits-api", selected: true }]);
    });

    it("403s an Azure Repos repository in a different Azure DevOps organization", async () => {
      await expect(
        onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "fabrikam/Proj/permits-api" }])
      ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("Azure DevOps organization") });
      expect(mockReplaceRepos).not.toHaveBeenCalled();
    });

    it("403s an Azure Repos repository when no usable Azure DevOps connection is configured", async () => {
      installOrgScope({ azureOrgUrl: null });
      await expect(
        onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "contoso/Proj/permits-api" }])
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockReplaceRepos).not.toHaveBeenCalled();
    });

    it("resolves the Azure scope through the run's own connection_id (the one PR opening will use)", async () => {
      mockGetRunById.mockResolvedValue(baseRun({ status: "draft", connection_id: "ado-conn-2" }));
      await onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "contoso/Proj/permits-api" }]);
      expect(mockGetConnection).toHaveBeenCalledWith("org-1", "azure_devops", "ado-conn-2");
    });
  });

  it("422s a repository entry missing fullName entirely", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    await expect(
      onboarding.setRunRepositories(USER_ID, RUN_ID, [{} as any])
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(mockReplaceRepos).not.toHaveBeenCalled();
  });

  it("replaces the selection and advances the step to connect", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    mockReplaceRepos.mockResolvedValue([]);
    mockUpdateRun.mockResolvedValue(baseRun({ status: "draft", step: "connect" }));
    mockListRepos.mockResolvedValue([{ id: "r1", full_name: "goa/permits-api", selected: true }]);

    const view = await onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "goa/permits-api" }]);

    expect(mockReplaceRepos).toHaveBeenCalledWith(RUN_ID, [{ fullName: "goa/permits-api", selected: true }]);
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { step: "connect" });
    expect(view.step).toBe("connect");
  });
});

describe("startRun", () => {
  beforeEach(() => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
  });

  it("409s if the run isn't in draft (the atomic claim finds 0 matching rows)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockClaimRunTransition.mockResolvedValue(null);

    await expect(onboarding.startRun(USER_ID, RUN_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockClaimRunTransition).toHaveBeenCalledWith(RUN_ID, "draft", { status: "running", step: "sandbox" });
  });

  it("422s when no repository is selected", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    mockListRepos.mockResolvedValue([{ full_name: "goa/permits-api", selected: false }]);
    await expect(onboarding.startRun(USER_ID, RUN_ID)).rejects.toMatchObject({ statusCode: 422 });
    expect(mockClaimRunTransition).not.toHaveBeenCalled();
  });

  it("409s a second concurrent start once the first has already claimed the run (no second job dispatch)", async () => {
    const dispatcher = controlledDispatcher();
    setJobDispatcher(dispatcher);

    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    mockListRepos.mockResolvedValue([{ full_name: "goa/permits-api", selected: true }]);
    // First caller's claim succeeds; a second, concurrent caller's claim
    // (racing on the same `WHERE status = 'draft'`) finds 0 rows.
    mockClaimRunTransition.mockResolvedValueOnce(baseRun({ status: "running", step: "sandbox" })).mockResolvedValueOnce(null);
    mockUpdateRun.mockResolvedValue(baseRun({ status: "running", step: "sandbox", job_execution_id: "job-exec-1" }));

    const [first, second] = await Promise.allSettled([
      onboarding.startRun(USER_ID, RUN_ID),
      onboarding.startRun(USER_ID, RUN_ID),
    ]);

    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect((second as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it("dispatches the sandbox job and moves the run to running/sandbox", async () => {
    const dispatcher = controlledDispatcher();
    setJobDispatcher(dispatcher);

    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    mockListRepos.mockResolvedValue([{ full_name: "goa/permits-api", selected: true }]);
    mockClaimRunTransition.mockResolvedValue(baseRun({ status: "running", step: "sandbox" }));
    mockUpdateRun.mockResolvedValue(baseRun({ status: "running", step: "sandbox", job_execution_id: "job-exec-1" }));

    const view = await onboarding.startRun(USER_ID, RUN_ID);

    expect(dispatcher.dispatch).toHaveBeenCalled();
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { jobExecutionId: "job-exec-1" });
    expect(view.status).toBe("running");
  });

  it("wires the dispatcher's onProgress to broadcast on the run's realtime channel (fix round 2, item 6)", async () => {
    const dispatcher = controlledDispatcher();
    setJobDispatcher(dispatcher);

    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    mockListRepos.mockResolvedValue([{ full_name: "goa/permits-api", selected: true }]);
    mockClaimRunTransition.mockResolvedValue(baseRun({ status: "running", step: "sandbox" }));
    mockUpdateRun.mockResolvedValue(baseRun({ status: "running", step: "sandbox", job_execution_id: "job-exec-1" }));

    await onboarding.startRun(USER_ID, RUN_ID);

    expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.anything(), expect.any(Function), expect.any(Function));
    const onProgress = (dispatcher.dispatch as jest.Mock).mock.calls[0][2];

    onProgress({ type: "step", step: "sandbox", message: "Running" });

    expect(mockBroadcastOnboardingProgress).toHaveBeenCalledWith(RUN_ID, {
      type: "step",
      step: "sandbox",
      message: "Running",
    });
  });

  it("applies a completed sandbox result: fills repositories and moves the run to ready/output", async () => {
    const dispatcher = controlledDispatcher();
    setJobDispatcher(dispatcher);

    mockGetRunById
      .mockResolvedValueOnce(baseRun({ status: "draft" })) // startRun's own access check
      .mockResolvedValueOnce(baseRun({ status: "running" })); // applySandboxResult's lookup
    mockListRepos.mockResolvedValue([{ full_name: "goa/permits-api", selected: true }]);
    mockClaimRunTransition.mockResolvedValue(baseRun({ status: "running", step: "sandbox" }));
    mockUpdateRun.mockResolvedValue(baseRun({ status: "running" }));

    await onboarding.startRun(USER_ID, RUN_ID);

    await dispatcher.complete({
      runId: RUN_ID,
      status: "ready",
      repositories: [{ fullName: "goa/permits-api", detectedProfile: "node", generatedManifest: [{ path: "a", content: "b" }] }],
    });

    expect(mockUpdateRepo).toHaveBeenCalledWith(
      RUN_ID,
      "goa/permits-api",
      expect.objectContaining({ detectedProfile: "node" })
    );
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ status: "ready", step: "output" }));
  });

  it("ignores a late sandbox result for a run that already moved on", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "cancelled" }));

    await onboarding.applySandboxResult({ runId: RUN_ID, status: "ready", repositories: [] });

    expect(mockUpdateRepo).not.toHaveBeenCalled();
    expect(mockUpdateRun).not.toHaveBeenCalled();
  });
});

describe("getRunOutput", () => {
  beforeEach(() => mockCheckTeamAccess.mockResolvedValue(authorizedAccess()));

  it("409s before the run has reached ready/prs_open/completed", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "running" }));
    await expect(onboarding.getRunOutput(USER_ID, RUN_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("returns output once the run is ready", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockListRepos.mockResolvedValue([{ full_name: "goa/permits-api" }]);
    const view = await onboarding.getRunOutput(USER_ID, RUN_ID);
    expect(view.repositories).toHaveLength(1);
  });
});

describe("openPullRequests — confirm gate and idempotency", () => {
  beforeEach(() => {
    mockCheckTeamAccess.mockResolvedValue(authorizedAccess());
    mockGetTeamOrgId.mockResolvedValue("org-1");
    // Fix round 2, item 4: claimPrLease replaces the old transaction-held
    // advisory lock. Its return value is the authoritative run for the rest
    // of the call (mirrors whatever mockGetRunById returns for the
    // pre-check, unless a test overrides one or the other). releasePrLease
    // resolves fine by default; tests can still assert it was called.
    mockClaimPrLease.mockResolvedValue(baseRun({ status: "ready" }));
    mockRenewPrLease.mockResolvedValue(true);
    mockReleasePrLease.mockResolvedValue(undefined);
  });

  it("never opens a PR without confirm: true, even when the run is ready (400/422)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));

    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, {})).rejects.toMatchObject({ statusCode: 422 });
    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: false })).rejects.toMatchObject({ statusCode: 422 });
    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: "true" as any })).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: 1 as any })).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: "yes" as any })).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: null as any })).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(mockOpenPr).not.toHaveBeenCalled();
  });

  it("rejects confirm before the run is ready (still draft/running) — 409, no PR opened", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "running" }));

    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true })).rejects.toMatchObject({ statusCode: 409 });
    expect(mockOpenPr).not.toHaveBeenCalled();
  });

  it("opens one PR per selected repository once confirmed and ready", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" })); // pre-check
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

    const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).toHaveBeenCalledTimes(1);
    expect(mockOpenPr).toHaveBeenCalledWith(expect.objectContaining({ provider: "github", fullName: "goa/permits-api" }));
    expect(mockUpdateRepo).toHaveBeenCalledWith(RUN_ID, "goa/permits-api", { prNumber: 42, prState: "open", review: {} });
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { status: "prs_open", step: "prs" });
    expect(view.status).toBe("prs_open");
  });

  it("is idempotent: confirming again after prs_open does not reopen PRs for repos that already have one", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "prs_open" }));
    mockClaimPrLease.mockResolvedValue(baseRun({ status: "prs_open" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: 42, // already opened
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);

    const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).not.toHaveBeenCalled();
    // Already prs_open — no further state transition attempted.
    expect(mockUpdateRun).not.toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ status: "prs_open" }));
    expect(view.status).toBe("prs_open");
  });

  it("creates the application and registers the repository once a PR is open", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready", application_id: null }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        detected_profile: "node",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open" });
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO public.applications")) return { rows: [{ id: "app-1" }] };
      if (sql.includes("ar.report_secret_ref")) return { rows: [] };
      if (sql.includes("INSERT INTO public.application_repositories")) return { rows: [{ application_id: "app-1" }] };
      return { rows: [] };
    });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", application_id: "app-1" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    const insertAppCall = mockDbQuery.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO public.applications"));
    expect(insertAppCall).toBeDefined();
    const insertRepoCall = mockDbQuery.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO public.application_repositories"));
    expect(insertRepoCall).toBeDefined();
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { applicationId: "app-1" });
  });

  it("persists the resolved default_branch and a minted report_secret_ref for a newly opened PR (fix round 1, items 2/3)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready", application_id: null }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open", defaultBranch: "trunk" });
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO public.applications")) return { rows: [{ id: "app-1" }] };
      if (sql.includes("ar.report_secret_ref")) return { rows: [] };
      if (sql.includes("INSERT INTO public.application_repositories")) return { rows: [{ application_id: "app-1" }] };
      return { rows: [] };
    });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", application_id: "app-1" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    const insertRepoCall = mockDbQuery.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO public.application_repositories"));
    expect(insertRepoCall).toBeDefined();
    const [, params] = insertRepoCall as [string, any[]];
    // application_id, provider, full_name, default_branch, ci_provider, ...
    expect(params[3]).toBe("trunk");
    const reportSecretRef = params[params.length - 1];
    expect(typeof reportSecretRef).toBe("string");
    expect(reportSecretRef.length).toBeGreaterThan(0);

    // The same reference is what the PR body should have named — never a
    // secret VALUE, only the reference.
    const prCall = mockOpenPr.mock.calls[0][0];
    expect(prCall.body).toContain(reportSecretRef);
    expect(prCall.body).not.toMatch(/[0-9a-f]{64}/); // no raw 256-bit hex secret value
  });

  it("reuses an existing report_secret_ref instead of minting a new one on retry (fix round 1, item 2)", async () => {
    // application_id already set (a retry within the same, already-linked
    // application) so the existing registration's applicationId matches and
    // this repository isn't blocked by the fix round 2, item 1 guard.
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready", application_id: "app-1" }));
    mockClaimPrLease.mockResolvedValue(baseRun({ status: "ready", application_id: "app-1" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open", defaultBranch: "main" });
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("ar.report_secret_ref")) {
        return {
          rows: [
            {
              application_id: "app-1",
              report_secret_ref: "integration-onboarding-mesh-existing",
              default_branch: "main",
              organization_id: "org-1",
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO public.application_repositories")) return { rows: [{ application_id: "app-1" }] };
      return { rows: [] };
    });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", application_id: "app-1" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    const prCall = mockOpenPr.mock.calls[0][0];
    expect(prCall.body).toContain("integration-onboarding-mesh-existing");

    const insertRepoCall = mockDbQuery.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO public.application_repositories"));
    const [, params] = insertRepoCall as [string, any[]];
    expect(params[params.length - 1]).toBe("integration-onboarding-mesh-existing");
  });

  it("rejects a repository whose generated manifest has a disallowed path, without calling openRepositoryPullRequest for it (fix round 1, item 8)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: "../../etc/passwd", content: "evil" }],
      },
    ]);

    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true })).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(mockOpenPr).not.toHaveBeenCalled();
  });

  it("rejects only the repository with a disallowed path, still opening the PR for the other (partial success)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/ok-repo",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
      {
        full_name: "goa/evil-repo",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: "/etc/passwd", content: "evil" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open", defaultBranch: "main" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

    const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).toHaveBeenCalledTimes(1);
    expect(mockOpenPr).toHaveBeenCalledWith(expect.objectContaining({ fullName: "goa/ok-repo" }));
    expect(view.status).toBe("prs_open");
  });

  it("does not recreate the application once the run already has one", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready", application_id: "existing-app" }));
    mockClaimPrLease.mockResolvedValue(baseRun({ status: "ready", application_id: "existing-app" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", application_id: "existing-app" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    const insertAppCall = mockDbQuery.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO public.applications"));
    expect(insertAppCall).toBeUndefined();
    expect(mockUpdateRun).not.toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ applicationId: expect.anything() }));
  });

  it("skips a selected repository with no generated files and still succeeds for the rest (partial success)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
      {
        full_name: "goa/no-manifest",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

    const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    // Only the repo with generated files got a PR; the run still advances
    // because not every repository failed.
    expect(mockOpenPr).toHaveBeenCalledTimes(1);
    expect(mockOpenPr).toHaveBeenCalledWith(expect.objectContaining({ fullName: "goa/permits-api" }));
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { status: "prs_open", step: "prs" });
    expect(view.status).toBe("prs_open");
  });

  it("partial failure: one repo's PR call throws, the other succeeds — run still advances (207-style partial success)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/ok-repo",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
      {
        full_name: "goa/broken-repo",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockImplementation(async ({ fullName }: any) => {
      if (fullName === "goa/broken-repo") throw new Error("GitHub API returned 500");
      return { prNumber: 42, prState: "open" };
    });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

    const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).toHaveBeenCalledTimes(2);
    expect(mockUpdateRepo).toHaveBeenCalledWith(RUN_ID, "goa/ok-repo", { prNumber: 42, prState: "open", review: {} });
    expect(mockUpdateRepo).toHaveBeenCalledWith(
      RUN_ID,
      "goa/broken-repo",
      expect.objectContaining({ review: expect.objectContaining({ prError: expect.any(String) }) })
    );
    // The run still advances to prs_open because at least one PR opened.
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { status: "prs_open", step: "prs" });
    expect(view.status).toBe("prs_open");
  });

  it("every repository failing to open a PR throws (500) and does not advance the run past ready", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/broken-repo",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockRejectedValue(new Error("GitHub API returned 500: secret upstream detail, e.g. an internal hostname"));

    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true })).rejects.toMatchObject({
      statusCode: 500,
      // Fix round 1, item 9: the raw upstream error text never reaches the
      // client, even in the aggregate "every repo failed" message.
      message: expect.not.stringContaining("secret upstream detail"),
    });
    expect(mockUpdateRun).not.toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ status: "prs_open" }));
  });

  it("never echoes the raw upstream error to the client on a partial failure, and surfaces a generic warning in the view (fix round 1, items 9/10)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    // Call #1 (drives the PR-opening loop): pre-failure state. Call #2 (the
    // final `toView` read for the response): reflects what this call itself
    // just persisted for the broken repo.
    mockListRepos
      .mockResolvedValueOnce([
        {
          full_name: "goa/ok-repo",
          selected: true,
          pr_number: null,
          detected_ci: "github_actions",
          generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
          review: {},
        },
        {
          full_name: "goa/broken-repo",
          selected: true,
          pr_number: null,
          detected_ci: "github_actions",
          generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
          review: {},
        },
      ])
      .mockResolvedValueOnce([
        { full_name: "goa/ok-repo", selected: true, pr_number: 42, review: {} },
        {
          full_name: "goa/broken-repo",
          selected: true,
          pr_number: null,
          review: { prError: "could not open the pull request (see server logs for details)" },
        },
      ]);
    mockOpenPr.mockImplementation(async ({ fullName }: any) => {
      if (fullName === "goa/broken-repo") {
        throw new Error('Could not open PR: 422 {"message":"upstream internal detail"}');
      }
      return { prNumber: 42, prState: "open", defaultBranch: "main" };
    });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

    const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    // The per-repo update call persisting the failure never contains the
    // raw upstream text.
    const brokenRepoUpdate = mockUpdateRepo.mock.calls.find(([, fullName]: [string, string]) => fullName === "goa/broken-repo");
    expect(brokenRepoUpdate).toBeDefined();
    const persistedReview = brokenRepoUpdate![2].review;
    expect(persistedReview.prError).not.toContain("upstream internal detail");
    expect(persistedReview.prError).toBe("could not open the pull request (see server logs for details)");

    expect(view.warnings).toEqual(["goa/broken-repo: could not open the pull request (see server logs for details)"]);
  });

  it("retry after a partial failure only reopens PRs for repos that are still missing one", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" })); // retried confirm call
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/already-open",
        selected: true,
        pr_number: 7, // opened on a previous confirm
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
      {
        full_name: "goa/previously-failed",
        selected: true,
        pr_number: null, // failed last time, still missing a PR
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 8, prState: "open" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

    const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).toHaveBeenCalledTimes(1);
    expect(mockOpenPr).toHaveBeenCalledWith(expect.objectContaining({ fullName: "goa/previously-failed" }));
    expect(view.status).toBe("prs_open");
  });

  it("routes an Azure Repos (<adoOrg>/<project>/<repo>) repository to the azure_devops provider", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready", connection_id: "conn-1" }));
    mockClaimPrLease.mockResolvedValue(baseRun({ status: "ready", connection_id: "conn-1" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "contoso/MyProject/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "azure_pipelines",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 5, prState: "open" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "azure_devops", connectionId: "conn-1", organizationId: "org-1" })
    );
  });

  it("routes a GitHub repository built with Azure Pipelines to the github provider (provider comes from full_name, not detected_ci)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockClaimPrLease.mockResolvedValue(baseRun({ status: "ready" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "azure_pipelines",
        generated_manifest: [{ path: "azure-pipelines/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 5, prState: "open", defaultBranch: "main" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).toHaveBeenCalledWith(expect.objectContaining({ provider: "github", fullName: "goa/permits-api" }));
    const insert = mockDbQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO public.application_repositories"));
    expect(insert?.[1]?.[1]).toBe("github");
  });

  it("claims an atomic PR-opening lease rather than holding a transaction/connection open (fix round 2, item 4)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    // Claimed with a per-call owner token, and released with the SAME token
    // (fix round 3) so a release can only clear this call's own lease.
    expect(mockClaimPrLease).toHaveBeenCalledWith(RUN_ID, expect.stringMatching(/^[0-9a-f-]{36}$/));
    const ownerToken = mockClaimPrLease.mock.calls[0][1];
    expect(mockReleasePrLease).toHaveBeenCalledWith(RUN_ID, ownerToken);
    // No transaction-held advisory lock — claimPrLease/releasePrLease are
    // independent, short statements, not a `db.transaction()` wrapping the
    // whole PR-opening call. The only transaction is the DB-only
    // application-link step (fix round 3, item 3), which starts after every
    // provider call has finished.
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    expect(mockDbTransaction.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...mockOpenPr.mock.invocationCallOrder)
    );
  });

  it("409s with 'PR opening already in progress' when the lease claim finds 0 rows (another confirm is in flight)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockClaimPrLease.mockResolvedValue(null);

    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("already in progress"),
    });
    expect(mockOpenPr).not.toHaveBeenCalled();
    expect(mockReleasePrLease).not.toHaveBeenCalled(); // never claimed, nothing to release
  });

  describe("organization scope re-checked before any credential (fix round 3, item 6)", () => {
    it("skips a repository whose owner left the organization's scope after selection: no secret, no PR, a warning", async () => {
      mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
      mockListRepos.mockResolvedValue([
        {
          full_name: "goa/permits-api",
          selected: true,
          pr_number: null,
          detected_ci: "github_actions",
          review: {},
          generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
        },
        {
          full_name: "former-owner/legacy",
          selected: true,
          pr_number: null,
          detected_ci: "github_actions",
          review: {},
          generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
        },
      ]);
      mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open", defaultBranch: "main" });
      mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open" }));

      await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

      expect(mockOpenPr).toHaveBeenCalledTimes(1);
      expect(mockOpenPr).toHaveBeenCalledWith(expect.objectContaining({ fullName: "goa/permits-api", organizationId: "org-1" }));
      expect(mockUpdateRepo).toHaveBeenCalledWith(RUN_ID, "former-owner/legacy", {
        review: { prError: onboarding.REPOSITORY_OUT_OF_SCOPE_WARNING },
      });
      const upserted = mockDbQuery.mock.calls
        .filter(([sql]) => String(sql).includes("INSERT INTO public.application_repositories"))
        .map(([, params]) => params[2]);
      expect(upserted).toEqual(["goa/permits-api"]);
    });

    it("fails the confirm (stays ready) when every repository is out of scope", async () => {
      installOrgScope({ githubOwners: null });
      mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
      mockListRepos.mockResolvedValue([
        {
          full_name: "goa/permits-api",
          selected: true,
          pr_number: null,
          detected_ci: "github_actions",
          review: {},
          generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
        },
      ]);

      await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true })).rejects.toMatchObject({ statusCode: 500 });
      expect(mockOpenPr).not.toHaveBeenCalled();
      expect(mockUpdateRun).not.toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ status: "prs_open" }));
    });
  });

  describe("repository already linked to another application (blocked; fix round 2 item 1, fix round 3 item 3)", () => {
    function readyRepo(fullName: string) {
      return {
        full_name: fullName,
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        review: { summary: "ok" },
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      };
    }
    const upsertCalls = () =>
      mockDbQuery.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO public.application_repositories"));

    beforeEach(() => {
      mockGetRunById.mockResolvedValue(baseRun({ status: "ready", application_id: null }));
      mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open", defaultBranch: "main" });
      mockUpdateRun.mockImplementation(async (_id: string, patch: any) => baseRun({ status: "prs_open", ...patch }));
    });

    it("pre-check: a repository registered to another application is never upserted and is marked blocked", async () => {
      mockListRepos.mockResolvedValue([readyRepo("goa/permits-api")]);
      mockDbQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("ar.report_secret_ref")) {
          return { rows: [{ application_id: "other-app", organization_id: "org-2", report_secret_ref: "x", default_branch: "main" }] };
        }
        if (sql.includes("INSERT INTO public.applications")) return { rows: [{ id: "app-1" }] };
        return { rows: [] };
      });

      const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

      expect(upsertCalls()).toHaveLength(0);
      expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO public.applications"))).toBe(false);
      expect(mockUpdateRun).not.toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ applicationId: expect.anything() }));
      expect(mockUpdateRepo).toHaveBeenCalledWith(RUN_ID, "goa/permits-api", {
        review: { summary: "ok", applicationLinkWarning: onboarding.APPLICATION_LINK_BLOCKED_WARNING },
      });
      expect(view.status).toBe("prs_open");
    });

    it("race: the guarded upsert RETURNs no row -> blocked, and the application created for it is rolled back", async () => {
      mockListRepos.mockResolvedValue([readyRepo("goa/permits-api")]);
      // Pre-check sees nothing registered; by the time the upsert runs,
      // another run registered it -> ON CONFLICT ... WHERE matches 0 rows.
      mockDbQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO public.applications")) return { rows: [{ id: "app-1" }] };
        return { rows: [] };
      });

      const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

      const [upsert] = upsertCalls();
      expect(String(upsert[0])).toMatch(/RETURNING application_id/);
      // Application insert + upsert ran inside one transaction, which was
      // aborted (the callback rejected) so no empty application survives.
      expect(mockDbTransaction).toHaveBeenCalledTimes(1);
      await expect(mockDbTransaction.mock.results[0].value).rejects.toBeDefined();
      expect(mockUpdateRun).not.toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ applicationId: expect.anything() }));
      expect(mockUpdateRepo).toHaveBeenCalledWith(
        RUN_ID,
        "goa/permits-api",
        expect.objectContaining({
          review: expect.objectContaining({ applicationLinkWarning: onboarding.APPLICATION_LINK_BLOCKED_WARNING }),
        })
      );
      // The PR itself did open; the run still advances, with the warning.
      expect(view.status).toBe("prs_open");
    });

    it("race, partial: only the repository whose upsert RETURNs nothing is blocked; the rest link to the new application", async () => {
      mockListRepos.mockResolvedValue([readyRepo("goa/linked"), readyRepo("goa/taken")]);
      mockDbQuery.mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes("INSERT INTO public.applications")) return { rows: [{ id: "app-1" }] };
        if (sql.includes("INSERT INTO public.application_repositories")) {
          return params?.[2] === "goa/taken" ? { rows: [] } : { rows: [{ application_id: "app-1" }] };
        }
        return { rows: [] };
      });

      await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

      expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { applicationId: "app-1" });
      const warned = mockUpdateRepo.mock.calls.filter(([, , patch]) => patch?.review?.applicationLinkWarning);
      expect(warned.map(([, name]) => name)).toEqual(["goa/taken"]);
    });

    it("race on a retry (application already exists): blocked, the existing application is kept", async () => {
      mockGetRunById.mockResolvedValue(baseRun({ status: "ready", application_id: "app-1" }));
      mockClaimPrLease.mockResolvedValue(baseRun({ status: "ready", application_id: "app-1" }));
      mockListRepos.mockResolvedValue([readyRepo("goa/permits-api")]);
      mockDbQuery.mockImplementation(async () => ({ rows: [] }));

      await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

      expect(mockDbQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO public.applications"))).toBe(false);
      expect(await mockDbTransaction.mock.results[0].value).toEqual({ applicationId: "app-1", blocked: ["goa/permits-api"] });
      expect(mockUpdateRepo).toHaveBeenCalledWith(
        RUN_ID,
        "goa/permits-api",
        expect.objectContaining({
          review: expect.objectContaining({ applicationLinkWarning: onboarding.APPLICATION_LINK_BLOCKED_WARNING }),
        })
      );
    });

    it("surfaces the blocked state in the run's warnings", async () => {
      mockGetRunById.mockResolvedValue(baseRun({ status: "prs_open" }));
      mockListRepos.mockResolvedValue([
        { ...readyRepo("goa/permits-api"), pr_number: 42, review: { applicationLinkWarning: onboarding.APPLICATION_LINK_BLOCKED_WARNING } },
      ]);
      const view = await onboarding.getRun(USER_ID, RUN_ID);
      expect(view.warnings).toEqual([`goa/permits-api: ${onboarding.APPLICATION_LINK_BLOCKED_WARNING}`]);
    });
  });

  it("releases the lease even when opening every PR fails (finally, not just on success)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/broken-repo",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      },
    ]);
    mockOpenPr.mockRejectedValue(new Error("GitHub API returned 500"));

    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true })).rejects.toMatchObject({
      statusCode: 500,
    });

    expect(mockReleasePrLease).toHaveBeenCalledWith(RUN_ID, mockClaimPrLease.mock.calls[0][1]);
  });

  describe("lease renewal and expiry while running (fix round 3)", () => {
    function readyRepos(n: number) {
      return Array.from({ length: n }, (_, i) => ({
        full_name: `goa/repo-${i + 1}`,
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        review: {},
        generated_manifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "y" }],
      }));
    }

    it("renews the lease (with its owner token) before every repository and before the run-level writes", async () => {
      mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
      mockListRepos.mockResolvedValue(readyRepos(3));
      mockOpenPr.mockResolvedValue({ prNumber: 7, prState: "open", defaultBranch: "main" });
      mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

      await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

      const ownerToken = mockClaimPrLease.mock.calls[0][1];
      // 3 repositories + 1 final check before linking/status.
      expect(mockRenewPrLease).toHaveBeenCalledTimes(4);
      for (const call of mockRenewPrLease.mock.calls) expect(call).toEqual([RUN_ID, ownerToken]);
      // Each renewal happens before that repository's provider calls.
      const renewOrder = mockRenewPrLease.mock.invocationCallOrder;
      const openOrder = mockOpenPr.mock.invocationCallOrder;
      expect(renewOrder[0]).toBeLessThan(openOrder[0]);
      expect(renewOrder[1]).toBeGreaterThan(openOrder[0]);
      expect(renewOrder[1]).toBeLessThan(openOrder[1]);
    });

    it("stops (409) when the lease expired mid-run and another call re-claimed it: no further PRs, no run-level writes, and the other holder's lease isn't cleared", async () => {
      mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
      mockListRepos.mockResolvedValue(readyRepos(3));
      mockOpenPr.mockResolvedValue({ prNumber: 7, prState: "open", defaultBranch: "main" });
      // Repo 1: still ours. Before repo 2: our lease lapsed and another
      // confirm claimed it (its owner token replaced ours) -> renewal matches 0 rows.
      mockRenewPrLease.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true })).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining("taken over"),
      });

      expect(mockOpenPr).toHaveBeenCalledTimes(1);
      expect(mockOpenPr).toHaveBeenCalledWith(expect.objectContaining({ fullName: "goa/repo-1" }));
      // Repo 1's PR is persisted (so the new holder skips it)...
      expect(mockUpdateRepo).toHaveBeenCalledWith(RUN_ID, "goa/repo-1", expect.objectContaining({ prNumber: 7 }));
      // ...but nothing run-level is written on a lease we no longer hold.
      expect(mockUpdateRun).not.toHaveBeenCalled();
      expect(
        mockDbQuery.mock.calls.some(([sql]) => /INSERT INTO public\.(applications|application_repositories)/.test(String(sql)))
      ).toBe(false);
      // Release is still attempted, but only with OUR token — the repository
      // layer's owner guard makes it a no-op against the new holder's lease.
      expect(mockReleasePrLease).toHaveBeenCalledWith(RUN_ID, mockClaimPrLease.mock.calls[0][1]);
    });

    it("uses a distinct owner token per call", async () => {
      mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
      mockListRepos.mockResolvedValue(readyRepos(1));
      mockOpenPr.mockResolvedValue({ prNumber: 7, prState: "open", defaultBranch: "main" });
      mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

      await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });
      await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

      expect(mockClaimPrLease.mock.calls[0][1]).not.toBe(mockClaimPrLease.mock.calls[1][1]);
    });
  });
});

describe("cancelRun", () => {
  beforeEach(() => mockCheckTeamAccess.mockResolvedValue(authorizedAccess()));

  it("409s when the run is already terminal", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "completed" }));
    await expect(onboarding.cancelRun(USER_ID, RUN_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("409s once PRs are open (cannot cancel)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "prs_open" }));
    await expect(onboarding.cancelRun(USER_ID, RUN_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("cancels a draft run", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    mockUpdateRun.mockResolvedValue(baseRun({ status: "cancelled" }));
    mockListRepos.mockResolvedValue([]);

    const view = await onboarding.cancelRun(USER_ID, RUN_ID);
    expect(view.status).toBe("cancelled");
  });

  it("cancels a running run: best-effort cancels the dispatched job execution", async () => {
    const dispatcher = { dispatch: jest.fn(), cancel: jest.fn(async () => {}) };
    setJobDispatcher(dispatcher as any);

    mockGetRunById.mockResolvedValue(baseRun({ status: "running", job_execution_id: "job-exec-1" }));
    mockUpdateRun.mockResolvedValue(baseRun({ status: "cancelled" }));
    mockListRepos.mockResolvedValue([]);

    const view = await onboarding.cancelRun(USER_ID, RUN_ID);

    expect(dispatcher.cancel).toHaveBeenCalledWith("job-exec-1");
    expect(view.status).toBe("cancelled");
  });

  it("still cancels the run even when the dispatcher's cancel call throws (best-effort)", async () => {
    const dispatcher = { dispatch: jest.fn(), cancel: jest.fn(async () => { throw new Error("job already finished"); }) };
    setJobDispatcher(dispatcher as any);

    mockGetRunById.mockResolvedValue(baseRun({ status: "running", job_execution_id: "job-exec-1" }));
    mockUpdateRun.mockResolvedValue(baseRun({ status: "cancelled" }));
    mockListRepos.mockResolvedValue([]);

    const view = await onboarding.cancelRun(USER_ID, RUN_ID);

    expect(dispatcher.cancel).toHaveBeenCalledWith("job-exec-1");
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { status: "cancelled" });
    expect(view.status).toBe("cancelled");
  });

  it("does not call the dispatcher's cancel when the run never had a job execution id (still draft)", async () => {
    const dispatcher = { dispatch: jest.fn(), cancel: jest.fn(async () => {}) };
    setJobDispatcher(dispatcher as any);

    mockGetRunById.mockResolvedValue(baseRun({ status: "draft", job_execution_id: null }));
    mockUpdateRun.mockResolvedValue(baseRun({ status: "cancelled" }));
    mockListRepos.mockResolvedValue([]);

    await onboarding.cancelRun(USER_ID, RUN_ID);

    expect(dispatcher.cancel).not.toHaveBeenCalled();
  });
});
