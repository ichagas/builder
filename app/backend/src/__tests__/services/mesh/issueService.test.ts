/**
 * Unit tests for services/mesh/issueService.ts (spec 007, WP-BE4, T125).
 */
import {
  openIssueForNewFindings,
  setAzureDevOpsClientProvider,
  resetAzureDevOpsClientProviderForTests,
  AzureDevOpsClientProvider,
} from "../../../services/mesh/issueService";

jest.mock("../../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockDbQuery = jest.fn();
jest.mock("../../../utils/database", () => ({
  __esModule: true,
  default: {
    query: (...args: any[]) => mockDbQuery(...args),
  },
}));

const mockIsGitHubAppConfigured = jest.fn();
const mockGetInstallationToken = jest.fn();
jest.mock("../../../utils/githubAppAuth", () => ({
  isGitHubAppConfigured: () => mockIsGitHubAppConfigured(),
  getInstallationToken: () => mockGetInstallationToken(),
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function runRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: "run-1",
    pack_version: "2026.3",
    report_url: "https://example.blob.core.windows.net/mesh-reports/permits-api/214/report.json",
    new_findings: 1,
    issue_ref: null,
    issue_opened_at: null,
    full_name: "goa/permits-api",
    provider: "github",
    team_id: "team-1",
    organization_id: "org-1",
    ...overrides,
  };
}

beforeEach(() => {
  mockDbQuery.mockReset();
  mockIsGitHubAppConfigured.mockReset();
  mockGetInstallationToken.mockReset();
  mockFetch.mockReset();
  resetAzureDevOpsClientProviderForTests();
});

describe("openIssueForNewFindings", () => {
  it("returns not-found when the run doesn't exist", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await openIssueForNewFindings("missing-run");
    expect(result).toEqual({ created: false, issueRef: null, message: "Run not found" });
  });

  it("is idempotent: a run with issue_opened_at already set is a no-op", async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [runRow({ issue_ref: "github:goa/permits-api#1", issue_opened_at: "2026-09-25T00:00:00Z" })],
    });

    const result = await openIssueForNewFindings("run-1");

    expect(result.created).toBe(false);
    expect(result.issueRef).toBe("github:goa/permits-api#1");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips when the run has no new findings", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [runRow({ new_findings: 0 })] });
    const result = await openIssueForNewFindings("run-1");
    expect(result.created).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("opens a GitHub issue via the GitHub App and records issue_ref", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [runRow()] });
    mockIsGitHubAppConfigured.mockReturnValue(true);
    mockGetInstallationToken.mockResolvedValue("installation-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ number: 42, html_url: "https://github.com/goa/permits-api/issues/42" }),
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE mesh_runs

    const result = await openIssueForNewFindings("run-1");

    expect(result.created).toBe(true);
    expect(result.issueRef).toBe("github:goa/permits-api#42");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/goa/permits-api/issues",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockDbQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("UPDATE public.mesh_runs SET issue_ref"),
      ["github:goa/permits-api#42", "run-1"],
    );
  });

  it("does not open an issue when the GitHub App isn't configured", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [runRow()] });
    mockIsGitHubAppConfigured.mockReturnValue(false);

    const result = await openIssueForNewFindings("run-1");

    expect(result.created).toBe(false);
    expect(result.issueRef).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns a failure result (not a throw) when GitHub returns an error", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [runRow()] });
    mockIsGitHubAppConfigured.mockReturnValue(true);
    mockGetInstallationToken.mockResolvedValue("installation-token");
    mockFetch.mockResolvedValue({ ok: false, status: 403, text: async () => "rate limited" });

    const result = await openIssueForNewFindings("run-1");

    expect(result.created).toBe(false);
    expect(result.message).toEqual(expect.stringContaining("403"));
  });

  it("uses the injected AzureDevOpsClientProvider for azure_devops repositories", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [runRow({ provider: "azure_devops", full_name: "MyProject" })] });
    const mockCreateWorkItem = jest.fn().mockResolvedValue({ id: 5678, url: "https://dev.azure.com/x/5678" });
    const provider: AzureDevOpsClientProvider = {
      getClient: jest.fn().mockResolvedValue({ createWorkItem: mockCreateWorkItem }),
    };
    setAzureDevOpsClientProvider(provider);
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE mesh_runs

    const result = await openIssueForNewFindings("run-1");

    expect(result.created).toBe(true);
    expect(result.issueRef).toBe("azure_devops:MyProject#5678");
    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      expect.objectContaining({ project: "MyProject" }),
    );
  });

  it("no-ops for azure_devops when no provider is configured yet (WP-BE8 TODO)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [runRow({ provider: "azure_devops", full_name: "MyProject" })] });
    // Default (unconfigured) provider is in effect — no setAzureDevOpsClientProvider call.

    const result = await openIssueForNewFindings("run-1");

    expect(result.created).toBe(false);
    expect(result.issueRef).toBeNull();
  });
});
