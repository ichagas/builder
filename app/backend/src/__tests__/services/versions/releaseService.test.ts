/**
 * Unit tests for `services/versions/releaseService.ts` (WP-BE2, T102).
 *
 * The GitHub API and the deploy dispatch are mocked via the injectable
 * `ReleaseGitHubClient` / `DeployTrigger` interfaces `DefaultReleaseService`
 * takes in its constructor, so no real network calls happen.
 * `resolveDefaultRepo` (services/versions/branchService.ts) is mocked
 * directly so repo presence is trivial to control per test.
 */
import { DefaultReleaseService, type ReleaseGitHubClient, type DeployTrigger } from "../../../services/versions/releaseService";

jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockBroadcast = jest.fn();
jest.mock("../../../websocket", () => ({
  broadcast: (...args: unknown[]) => mockBroadcast(...args),
}));

const mockResolveGitHubToken = jest.fn();
jest.mock("../../../utils/githubAuth", () => ({
  __esModule: true,
  resolveGitHubToken: (...args: any[]) => mockResolveGitHubToken(...args),
  gitHubApiHeaders: (token: string) => ({ Authorization: `token ${token}` }),
}));

const mockResolveDefaultRepo = jest.fn();
jest.mock("../../../services/versions/branchService", () => ({
  resolveDefaultRepo: (...args: any[]) => mockResolveDefaultRepo(...args),
}));

jest.mock("../../../services/deployment/docker/dockerDeploymentService", () => ({
  handle: jest.fn(),
}));

jest.mock("../../../utils/database", () => {
  const queryFn = jest.fn();
  const transactionFn = jest.fn();
  return {
    __esModule: true,
    default: {
      query: queryFn,
      transaction: transactionFn,
      healthCheck: jest.fn(),
      getActiveDbPort: jest.fn(),
    },
  };
});

import db from "../../../utils/database";
const mockDbQuery = db.query as jest.Mock;
const mockTransaction = db.transaction as jest.Mock;

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "owner-user";
const REPO = { id: "repo-1", organization: "goa", repo: "permits", branch: "main" };

/** SQL-text dispatch table shared by db.query and the fake transaction client. */
function makeQueryDispatcher(overrides: Record<string, (params: any[]) => any> = {}) {
  return async (sql: string, params: any[] = []) => {
    for (const [needle, handler] of Object.entries(overrides)) {
      if (sql.includes(needle)) return handler(params);
    }
    // Sensible defaults for statements not overridden by a test.
    if (sql.includes("SELECT * FROM projects")) return { rows: [] };
    if (sql.includes("SELECT * FROM versions WHERE id")) return { rows: [] };
    if (sql.includes("SELECT * FROM versions WHERE project_id")) return { rows: [] };
    if (sql.includes("SELECT wi.* FROM work_items")) return { rows: [] };
    if (sql.includes("SELECT * FROM work_items")) return { rows: [] };
    if (sql.includes("SELECT 1 FROM project_deployments")) return { rows: [] };
    if (sql.includes("SELECT id FROM project_deployments")) return { rows: [] };
    if (sql.includes("UPDATE")) return { rows: [{}] };
    if (sql.includes("INSERT")) return { rows: [{}] };
    return { rows: [] };
  };
}

function mockGitHubClient(overrides: Partial<ReleaseGitHubClient> = {}): ReleaseGitHubClient {
  return {
    getBranchSha: jest.fn().mockResolvedValue("head-sha"),
    mergeBranch: jest.fn().mockResolvedValue({ sha: "merge-sha" }),
    ensureTag: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockDeployTrigger(overrides: Partial<DeployTrigger> = {}): DeployTrigger {
  return {
    deploy: jest.fn().mockResolvedValue({ triggered: false, reason: "no-deployment-configured" }),
    ...overrides,
  };
}

beforeEach(() => {
  mockDbQuery.mockReset();
  mockTransaction.mockReset();
  mockBroadcast.mockReset();
  mockResolveGitHubToken.mockReset();
  mockResolveDefaultRepo.mockReset();
});

describe("releaseChecks", () => {
  it("first-release mode: flags unresolved work items and a missing repo, deployment is informational", async () => {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({
        "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "building" }] }),
        "SELECT wi.* FROM work_items": () => ({
          rows: [{ id: "wi-1", key: "WI-1", type: "bug", title: "Bug", status: "triage", branch: null, phase_state: {} }],
        }),
      })
    );
    mockResolveDefaultRepo.mockResolvedValueOnce(null);

    const service = new DefaultReleaseService(mockGitHubClient(), mockDeployTrigger());
    const result = await service.releaseChecks(PROJECT_ID);

    expect(result.canRelease).toBe(false);
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
    expect(byId["work-items-resolved"].passed).toBe(false);
    expect(byId["repository-linked"].passed).toBe(false);
    expect(byId["deployment-configured"].passed).toBe(false);
    // branches-reviewed / no-open-earlier-version don't apply pre-first-release.
    expect(byId["branches-reviewed"]).toBeUndefined();
    expect(byId["no-open-earlier-version"]).toBeUndefined();
  });

  it("first-release mode: passes when everything is shipped/declined and a repo is linked", async () => {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({
        "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "building" }] }),
        "SELECT wi.* FROM work_items": () => ({
          rows: [
            { id: "wi-1", key: "WI-1", type: "bug", title: "Bug", status: "shipped", branch: null, phase_state: {} },
            { id: "wi-2", key: "WI-2", type: "feature", title: "Feat", status: "declined", branch: null, phase_state: {} },
          ],
        }),
      })
    );
    mockResolveDefaultRepo.mockResolvedValueOnce(REPO);

    const service = new DefaultReleaseService(mockGitHubClient(), mockDeployTrigger());
    const result = await service.releaseChecks(PROJECT_ID);

    expect(result.canRelease).toBe(true);
  });

  it("post-first-release: adds branches-reviewed and no-open-earlier-version checks", async () => {
    const nextVersion = { id: "v-2", project_id: PROJECT_ID, name: "v1.5.0", kind: "building" };
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({
        "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "released" }] }),
        "SELECT * FROM versions WHERE project_id": () => ({ rows: [nextVersion] }),
        "SELECT * FROM work_items WHERE version_id": () => ({
          rows: [
            {
              id: "wi-1",
              key: "WI-1",
              type: "bug",
              title: "Bug",
              status: "shipped",
              branch: "fix/wi-1-bug",
              phase_state: { build: "active" },
            },
          ],
        }),
      })
    );
    mockResolveDefaultRepo.mockResolvedValueOnce(REPO);

    const service = new DefaultReleaseService(mockGitHubClient(), mockDeployTrigger());
    const result = await service.releaseChecks(PROJECT_ID);

    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
    expect(byId["branches-reviewed"].passed).toBe(false);
    expect(byId["no-open-earlier-version"].passed).toBe(true);
    expect(result.canRelease).toBe(false);
  });

  it("post-first-release: reports nothing open when every version is released", async () => {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({
        "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "released" }] }),
        "SELECT * FROM versions WHERE project_id": () => ({ rows: [] }),
      })
    );

    const service = new DefaultReleaseService(mockGitHubClient(), mockDeployTrigger());
    const result = await service.releaseChecks(PROJECT_ID);

    expect(result).toEqual({ projectId: PROJECT_ID, checks: [], canRelease: false });
  });
});

describe("release", () => {
  const version = { id: "v-1", project_id: PROJECT_ID, name: "v1.4.0", kind: "building" };
  const shippedItem = {
    id: "wi-1",
    key: "WI-1",
    type: "bug",
    title: "Fix the thing",
    status: "shipped",
    branch: "fix/wi-1-fix-the-thing",
  };
  const carryItem = { id: "wi-2", key: "WI-2", type: "feature", title: "Not done yet", status: "active", branch: null };

  function setUpHappyPath() {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({
        "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "released" }] }),
        "SELECT * FROM versions WHERE id": () => ({ rows: [version] }),
        "SELECT * FROM versions WHERE project_id = $1 AND kind <> 'released' AND id <>": () => ({ rows: [] }),
        "SELECT * FROM work_items WHERE version_id": () => ({ rows: [shippedItem, carryItem] }),
      })
    );
    mockResolveDefaultRepo.mockResolvedValue(REPO);
    mockResolveGitHubToken.mockResolvedValue({ token: "tok", source: "system_env" });
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
      const dispatch = makeQueryDispatcher({
        "SELECT * FROM versions WHERE project_id = $1 AND kind = 'next'": () => ({ rows: [] }),
        "INSERT INTO versions (project_id, name, kind) VALUES ($1, $2, 'next')": (params: any[]) => ({
          rows: [{ id: "v-next", project_id: PROJECT_ID, name: params[1], kind: "next" }],
        }),
        "UPDATE versions\n         SET kind = 'released'": () => ({
          rows: [{ ...version, kind: "released", is_current: true, git_tag: version.name }],
        }),
      });
      const client = { query: dispatch };
      return callback(client);
    });
  }

  it("merges shipped branches, tags, drafts notes, carries over unfinished items, and marks released", async () => {
    setUpHappyPath();
    const githubClient = mockGitHubClient();
    const deployTrigger = mockDeployTrigger();
    const service = new DefaultReleaseService(githubClient, deployTrigger);

    const result = await service.release(PROJECT_ID, version.id, USER_ID);

    expect(githubClient.mergeBranch).toHaveBeenCalledWith(
      "goa",
      "permits",
      "main",
      "fix/wi-1-fix-the-thing",
      expect.stringContaining("WI-1"),
      "tok"
    );
    expect(githubClient.ensureTag).toHaveBeenCalledWith("goa", "permits", "v1.4.0", "head-sha", "tok");
    expect(result.carriedOverWorkItemIds).toEqual(["wi-2"]);
    expect(result.version.kind).toBe("released");
    expect(mockBroadcast).toHaveBeenCalledWith(`versions-${PROJECT_ID}`, "item_moved", expect.objectContaining({ id: "wi-2" }));
    // "version_released" is broadcast by routes/versions.ts, not duplicated here.
  });

  it("enforces the in-order release rule", async () => {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({
        "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "released" }] }),
        "SELECT * FROM versions WHERE id": () => ({ rows: [version] }),
        "SELECT * FROM versions WHERE project_id = $1 AND kind <> 'released' AND id <>": () => ({
          rows: [{ id: "v-0", project_id: PROJECT_ID, name: "v1.3.0", kind: "hotfix" }],
        }),
      })
    );

    const service = new DefaultReleaseService(mockGitHubClient(), mockDeployTrigger());
    await expect(service.release(PROJECT_ID, version.id, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses to release an already-released (read-only) version", async () => {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({
        "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "released" }] }),
        "SELECT * FROM versions WHERE id": () => ({ rows: [{ ...version, kind: "released" }] }),
      })
    );
    const service = new DefaultReleaseService(mockGitHubClient(), mockDeployTrigger());
    await expect(service.release(PROJECT_ID, version.id, USER_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("requires the first release to have happened first", async () => {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({ "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "building" }] }) })
    );
    const service = new DefaultReleaseService(mockGitHubClient(), mockDeployTrigger());
    await expect(service.release(PROJECT_ID, version.id, USER_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("aborts before marking released and reports which change failed on a merge conflict", async () => {
    setUpHappyPath();
    const githubClient = mockGitHubClient({
      mergeBranch: jest.fn().mockResolvedValueOnce({ conflict: true, message: "conflict" }),
    });
    const service = new DefaultReleaseService(githubClient, mockDeployTrigger());

    await expect(service.release(PROJECT_ID, version.id, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: "MERGE_CONFLICT",
      details: expect.objectContaining({ workItemKey: "WI-1" }),
    });
    // No DB write happened — the version was never marked released.
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("is idempotent when retried after ensureTag already applied (tag client handles idempotency)", async () => {
    setUpHappyPath();
    const githubClient = mockGitHubClient();
    const service = new DefaultReleaseService(githubClient, mockDeployTrigger());

    await service.release(PROJECT_ID, version.id, USER_ID);
    await service.release(PROJECT_ID, version.id, USER_ID);

    expect(githubClient.ensureTag).toHaveBeenCalledTimes(2);
  });

  it("reports a skipped (not failed) deploy when nothing is configured", async () => {
    setUpHappyPath();
    const deployTrigger = mockDeployTrigger();
    const service = new DefaultReleaseService(mockGitHubClient(), deployTrigger);

    const result = await service.release(PROJECT_ID, version.id, USER_ID);

    expect(result.version.deployTriggered).toBe(false);
    expect(result.version.deployReason).toBe("no-deployment-configured");
  });
});

describe("firstRelease", () => {
  it("tags v1.0.0, locks the baseline, and flips projects.stage", async () => {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({
        "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "building" }] }),
        "SELECT wi.* FROM work_items": () => ({
          rows: [{ id: "wi-1", key: "WI-1", type: "bug", title: "Bug", status: "shipped", branch: null, phase_state: {} }],
        }),
      })
    );
    mockResolveDefaultRepo.mockResolvedValue(REPO);
    mockResolveGitHubToken.mockResolvedValue({ token: "tok", source: "system_env" });
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
      const dispatch = makeQueryDispatcher({
        "SELECT * FROM versions WHERE project_id = $1 AND kind = 'building'": () => ({ rows: [] }),
        "INSERT INTO versions (project_id, name, kind) VALUES ($1, 'v1.0.0', 'building')": () => ({
          rows: [{ id: "v-1", project_id: PROJECT_ID, name: "v1.0.0", kind: "building" }],
        }),
        "SET kind = 'released', is_first_release = true": () => ({
          rows: [{ id: "v-1", project_id: PROJECT_ID, name: "v1.0.0", kind: "released", git_tag: "v1.0.0" }],
        }),
        "UPDATE projects SET stage = 'released'": () => ({ rows: [{ id: PROJECT_ID, stage: "released" }] }),
      });
      return callback({ query: dispatch });
    });

    const githubClient = mockGitHubClient();
    const service = new DefaultReleaseService(githubClient, mockDeployTrigger());
    const result = await service.firstRelease(PROJECT_ID, USER_ID);

    expect(githubClient.ensureTag).toHaveBeenCalledWith("goa", "permits", "v1.0.0", "head-sha", "tok");
    expect(result.version.git_tag).toBe("v1.0.0");
    expect(result.project.stage).toBe("released");
  });

  it("refuses a second first-release", async () => {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({ "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "released" }] }) })
    );
    const service = new DefaultReleaseService(mockGitHubClient(), mockDeployTrigger());
    await expect(service.firstRelease(PROJECT_ID, USER_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses when checks fail (unresolved work items)", async () => {
    mockDbQuery.mockImplementation(
      makeQueryDispatcher({
        "SELECT * FROM projects": () => ({ rows: [{ id: PROJECT_ID, stage: "building" }] }),
        "SELECT wi.* FROM work_items": () => ({
          rows: [{ id: "wi-1", key: "WI-1", type: "bug", title: "Bug", status: "active", branch: null, phase_state: {} }],
        }),
      })
    );
    mockResolveDefaultRepo.mockResolvedValue(REPO);
    const service = new DefaultReleaseService(mockGitHubClient(), mockDeployTrigger());
    await expect(service.firstRelease(PROJECT_ID, USER_ID)).rejects.toMatchObject({ statusCode: 422 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
