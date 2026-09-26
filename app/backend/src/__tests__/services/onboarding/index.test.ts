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

jest.mock("../../../utils/database", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

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
  };
});

jest.mock("../../../services/onboarding/githubImport", () => ({
  listGitHubRepositories: jest.fn(),
}));

jest.mock("../../../services/onboarding/pullRequests", () => ({
  openRepositoryPullRequest: jest.fn(),
}));

import db from "../../../utils/database";
import { checkTeamAccess, getProfileId, getTeamOrgId } from "../../../services/teams/authorization";
import * as repo from "../../../services/onboarding/repository";
import { openRepositoryPullRequest } from "../../../services/onboarding/pullRequests";
import { setJobDispatcher, resetJobDispatcher, JobDispatcher, JobResult } from "../../../services/onboarding/jobDispatcher";
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
const mockOpenPr = openRepositoryPullRequest as jest.Mock;
const mockDbQuery = db.query as jest.Mock;

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

beforeEach(() => {
  jest.clearAllMocks();
  mockDbQuery.mockResolvedValue({ rows: [{ version: "2026.3" }] });
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
    mockListRepos.mockResolvedValue([{ id: "r1", full_name: "goa/permits-api" }]);

    const view = await onboarding.getRun(USER_ID, RUN_ID);
    expect(view.repositories).toHaveLength(1);
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

  it("409s once the run is no longer draft", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "running" }));
    await expect(
      onboarding.setRunRepositories(USER_ID, RUN_ID, [{ fullName: "goa/permits-api" }])
    ).rejects.toMatchObject({ statusCode: 409 });
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

  it("409s if the run isn't in draft", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));
    await expect(onboarding.startRun(USER_ID, RUN_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("422s when no repository is selected", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    mockListRepos.mockResolvedValue([{ full_name: "goa/permits-api", selected: false }]);
    await expect(onboarding.startRun(USER_ID, RUN_ID)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("dispatches the sandbox job and moves the run to running/sandbox", async () => {
    const dispatcher = controlledDispatcher();
    setJobDispatcher(dispatcher);

    mockGetRunById.mockResolvedValue(baseRun({ status: "draft" }));
    mockListRepos.mockResolvedValue([{ full_name: "goa/permits-api", selected: true }]);
    mockUpdateRun.mockResolvedValue(baseRun({ status: "running", step: "sandbox", job_execution_id: "job-exec-1" }));

    const view = await onboarding.startRun(USER_ID, RUN_ID);

    expect(dispatcher.dispatch).toHaveBeenCalled();
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { status: "running", step: "sandbox", jobExecutionId: "job-exec-1" });
    expect(view.status).toBe("running");
  });

  it("applies a completed sandbox result: fills repositories and moves the run to ready/output", async () => {
    const dispatcher = controlledDispatcher();
    setJobDispatcher(dispatcher);

    mockGetRunById
      .mockResolvedValueOnce(baseRun({ status: "draft" })) // startRun's own access check
      .mockResolvedValueOnce(baseRun({ status: "running" })); // applySandboxResult's lookup
    mockListRepos.mockResolvedValue([{ full_name: "goa/permits-api", selected: true }]);
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
  });

  it("never opens a PR without confirm: true, even when the run is ready (400/422)", async () => {
    mockGetRunById.mockResolvedValue(baseRun({ status: "ready" }));

    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, {})).rejects.toMatchObject({ statusCode: 422 });
    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: false })).rejects.toMatchObject({ statusCode: 422 });
    await expect(onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: "true" as any })).rejects.toMatchObject({
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
    mockGetRunById
      .mockResolvedValueOnce(baseRun({ status: "ready" }))
      .mockResolvedValueOnce(baseRun({ status: "prs_open" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: "x", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", step: "prs" }));

    const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).toHaveBeenCalledTimes(1);
    expect(mockOpenPr).toHaveBeenCalledWith(expect.objectContaining({ provider: "github", fullName: "goa/permits-api" }));
    expect(mockUpdateRepo).toHaveBeenCalledWith(RUN_ID, "goa/permits-api", { prNumber: 42, prState: "open" });
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { status: "prs_open", step: "prs" });
    expect(view.status).toBe("prs_open");
  });

  it("is idempotent: confirming again after prs_open does not reopen PRs for repos that already have one", async () => {
    mockGetRunById
      .mockResolvedValueOnce(baseRun({ status: "prs_open" }))
      .mockResolvedValueOnce(baseRun({ status: "prs_open" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: 42, // already opened
        detected_ci: "github_actions",
        generated_manifest: [{ path: "x", content: "y" }],
      },
    ]);

    const view = await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).not.toHaveBeenCalled();
    // Already prs_open — no further state transition attempted.
    expect(mockUpdateRun).not.toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ status: "prs_open" }));
    expect(view.status).toBe("prs_open");
  });

  it("creates the application and registers the repository once a PR is open", async () => {
    mockGetRunById
      .mockResolvedValueOnce(baseRun({ status: "ready", application_id: null }))
      .mockResolvedValueOnce(baseRun({ status: "prs_open", application_id: "app-1" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        detected_profile: "node",
        generated_manifest: [{ path: "x", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open" });
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO public.applications")) return { rows: [{ id: "app-1" }] };
      return { rows: [{ version: "2026.3" }] };
    });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", application_id: "app-1" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    const insertAppCall = mockDbQuery.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO public.applications"));
    expect(insertAppCall).toBeDefined();
    const insertRepoCall = mockDbQuery.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO public.application_repositories"));
    expect(insertRepoCall).toBeDefined();
    expect(mockUpdateRun).toHaveBeenCalledWith(RUN_ID, { applicationId: "app-1" });
  });

  it("does not recreate the application once the run already has one", async () => {
    mockGetRunById
      .mockResolvedValueOnce(baseRun({ status: "ready", application_id: "existing-app" }))
      .mockResolvedValueOnce(baseRun({ status: "prs_open", application_id: "existing-app" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "goa/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "github_actions",
        generated_manifest: [{ path: "x", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 42, prState: "open" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open", application_id: "existing-app" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    const insertAppCall = mockDbQuery.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO public.applications"));
    expect(insertAppCall).toBeUndefined();
    expect(mockUpdateRun).not.toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ applicationId: expect.anything() }));
  });

  it("routes azure_pipelines repos to the azure_devops provider", async () => {
    mockGetRunById
      .mockResolvedValueOnce(baseRun({ status: "ready", connection_id: "conn-1" }))
      .mockResolvedValueOnce(baseRun({ status: "prs_open" }));
    mockListRepos.mockResolvedValue([
      {
        full_name: "MyProject/permits-api",
        selected: true,
        pr_number: null,
        detected_ci: "azure_pipelines",
        generated_manifest: [{ path: "x", content: "y" }],
      },
    ]);
    mockOpenPr.mockResolvedValue({ prNumber: 5, prState: "open" });
    mockUpdateRun.mockResolvedValue(baseRun({ status: "prs_open" }));

    await onboarding.openPullRequests(USER_ID, RUN_ID, { confirm: true });

    expect(mockOpenPr).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "azure_devops", connectionId: "conn-1", organizationId: "org-1" })
    );
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
});
