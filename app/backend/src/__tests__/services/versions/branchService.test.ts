/**
 * Unit tests for `services/versions/branchService.ts` (WP-BE2, T104).
 *
 * The GitHub API is mocked via the injectable `BranchGitHubClient` (unit
 * tests for `ensureBranchForWorkItem`) plus a mocked `resolveGitHubToken`
 * (via `utils/githubAuth`) so no real network calls happen.
 */
import {
  ensureBranchForWorkItem,
  stagingBranchForWorkItem,
  computeBranchName,
  slugifyTitle,
  type BranchGitHubClient,
} from "../../../services/versions/branchService";

jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockResolveGitHubToken = jest.fn();
jest.mock("../../../utils/githubAuth", () => ({
  __esModule: true,
  resolveGitHubToken: (...args: any[]) => mockResolveGitHubToken(...args),
  gitHubApiHeaders: (token: string) => ({ Authorization: `token ${token}` }),
}));

jest.mock("../../../utils/database", () => {
  const queryFn = jest.fn();
  return {
    __esModule: true,
    default: { query: queryFn, healthCheck: jest.fn(), getActiveDbPort: jest.fn() },
  };
});

import db from "../../../utils/database";
const mockDbQuery = db.query as jest.Mock;

const WORK_ITEM_ID = "33333333-3333-3333-3333-333333333333";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const REPO_ID = "44444444-4444-4444-4444-444444444444";

function mockWorkItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  mockDbQuery.mockResolvedValueOnce({
    rows: [
      {
        id: WORK_ITEM_ID,
        project_id: PROJECT_ID,
        key: "WI-42",
        type: "bug",
        title: "HEIC images fail to preview",
        branch: null,
        ...overrides,
      },
    ],
  });
}

function mockRepoRow(overrides: Partial<Record<string, unknown>> = {}) {
  mockDbQuery.mockResolvedValueOnce({
    rows: [{ id: REPO_ID, organization: "goa", repo: "permits", branch: "main", ...overrides }],
  });
}

beforeEach(() => {
  mockDbQuery.mockReset();
  mockResolveGitHubToken.mockReset();
});

describe("computeBranchName / slugifyTitle", () => {
  it("builds fix/wi-<n>-<slug> for bugs", () => {
    expect(
      computeBranchName({ key: "WI-42", type: "bug", title: "HEIC images fail to preview" })
    ).toBe("fix/wi-42-heic-images-fail-to-preview");
  });

  it("builds feat/wi-<n>-<slug> for enhancements and features", () => {
    expect(computeBranchName({ key: "WI-38", type: "enhancement", title: "Bulk export" })).toBe(
      "feat/wi-38-bulk-export"
    );
    expect(computeBranchName({ key: "WI-7", type: "feature", title: "SSO login" })).toBe(
      "feat/wi-7-sso-login"
    );
  });

  it("slugifies titles with punctuation and falls back for empty titles", () => {
    expect(slugifyTitle("Fix: crash on save!!")).toBe("fix-crash-on-save");
    expect(slugifyTitle("   ")).toBe("change");
  });
});

describe("ensureBranchForWorkItem", () => {
  it("creates a new branch off the repo's default branch and persists it", async () => {
    mockWorkItemRow();
    mockRepoRow();
    mockResolveGitHubToken.mockResolvedValueOnce({ token: "tok", source: "system_env" });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE work_items SET branch

    const client: BranchGitHubClient = {
      ensureBranch: jest.fn().mockResolvedValueOnce({ existed: false }),
    };

    const result = await ensureBranchForWorkItem(WORK_ITEM_ID, client);

    expect(result).toEqual({ branch: "fix/wi-42-heic-images-fail-to-preview", created: true });
    expect(client.ensureBranch).toHaveBeenCalledWith(
      "goa",
      "permits",
      "fix/wi-42-heic-images-fail-to-preview",
      "main",
      "tok"
    );
    const updateCall = mockDbQuery.mock.calls.find(([sql]) => sql.includes("UPDATE work_items"));
    expect(updateCall[1]).toEqual([WORK_ITEM_ID, "fix/wi-42-heic-images-fail-to-preview"]);
  });

  it("is idempotent: reuses an existing branch on GitHub", async () => {
    mockWorkItemRow();
    mockRepoRow();
    mockResolveGitHubToken.mockResolvedValueOnce({ token: "tok", source: "system_env" });
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const client: BranchGitHubClient = {
      ensureBranch: jest.fn().mockResolvedValueOnce({ existed: true }),
    };

    const result = await ensureBranchForWorkItem(WORK_ITEM_ID, client);
    expect(result).toEqual({ branch: "fix/wi-42-heic-images-fail-to-preview", created: false });
  });

  it("is idempotent: returns the existing branch without calling GitHub again", async () => {
    mockWorkItemRow({ branch: "fix/wi-42-heic-images-fail-to-preview" });
    const client: BranchGitHubClient = { ensureBranch: jest.fn() };

    const result = await ensureBranchForWorkItem(WORK_ITEM_ID, client);

    expect(result).toEqual({
      branch: "fix/wi-42-heic-images-fail-to-preview",
      created: false,
      skipped: "already-set",
    });
    expect(client.ensureBranch).not.toHaveBeenCalled();
  });

  it("skips cleanly when the project has no linked repo", async () => {
    mockWorkItemRow();
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no project_repos row
    const client: BranchGitHubClient = { ensureBranch: jest.fn() };

    const result = await ensureBranchForWorkItem(WORK_ITEM_ID, client);

    expect(result).toEqual({ branch: null, created: false, skipped: "no-repo" });
    expect(client.ensureBranch).not.toHaveBeenCalled();
  });

  it("skips cleanly when no GitHub token can be resolved", async () => {
    mockWorkItemRow();
    mockRepoRow();
    mockResolveGitHubToken.mockResolvedValueOnce(null);
    const client: BranchGitHubClient = { ensureBranch: jest.fn() };

    const result = await ensureBranchForWorkItem(WORK_ITEM_ID, client);

    expect(result).toEqual({ branch: null, created: false, skipped: "no-token" });
    expect(client.ensureBranch).not.toHaveBeenCalled();
  });

  it("skips cleanly (never throws) when the work item does not exist", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await ensureBranchForWorkItem("missing-id");
    expect(result).toEqual({ branch: null, created: false, skipped: "not-found" });
  });

  it("never throws: a GitHub error is swallowed and reported as skipped", async () => {
    mockWorkItemRow();
    mockRepoRow();
    mockResolveGitHubToken.mockResolvedValueOnce({ token: "tok", source: "system_env" });
    const client: BranchGitHubClient = {
      ensureBranch: jest.fn().mockRejectedValueOnce(new Error("boom")),
    };

    const result = await ensureBranchForWorkItem(WORK_ITEM_ID, client);
    expect(result).toEqual({ branch: null, created: false, skipped: "error" });
  });
});

describe("stagingBranchForWorkItem", () => {
  it("returns the work item's real branch when set", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ branch: "fix/wi-42-x" }] });
    expect(await stagingBranchForWorkItem(WORK_ITEM_ID)).toBe("fix/wi-42-x");
  });

  it("falls back to 'main' when no branch is set (legacy behaviour)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ branch: null }] });
    expect(await stagingBranchForWorkItem(WORK_ITEM_ID)).toBe("main");
  });
});
