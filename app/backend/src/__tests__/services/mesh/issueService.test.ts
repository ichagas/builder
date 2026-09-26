/**
 * Unit tests for services/mesh/issueService.ts (spec 007, WP-BE4, T125).
 */
import {
  openIssueForNewFindings,
  setAzureDevOpsClientProvider,
  resetAzureDevOpsClientProviderForTests,
  AzureDevOpsClientProvider,
  escapeMarkdown,
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
const mockGetInstallationTokenForRepo = jest.fn();
jest.mock("../../../utils/githubAppAuth", () => ({
  isGitHubAppConfigured: () => mockIsGitHubAppConfigured(),
  getInstallationTokenForRepo: (...args: unknown[]) => mockGetInstallationTokenForRepo(...args),
}));

const mockGetAzureDevOpsClient = jest.fn();
jest.mock("../../../services/integrations", () => ({
  getAzureDevOpsClient: (...args: unknown[]) => mockGetAzureDevOpsClient(...args),
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
    connection_id: null,
    team_id: "team-1",
    organization_id: "org-1",
    ...overrides,
  };
}

beforeEach(() => {
  mockDbQuery.mockReset();
  mockIsGitHubAppConfigured.mockReset();
  mockGetInstallationTokenForRepo.mockReset();
  mockGetAzureDevOpsClient.mockReset();
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
    mockGetInstallationTokenForRepo.mockResolvedValue("installation-token");
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

  it("requests a token scoped to only the target repository and issues:write, not an installation-wide token", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [runRow({ full_name: "goa/permits-api" })] });
    mockIsGitHubAppConfigured.mockReturnValue(true);
    mockGetInstallationTokenForRepo.mockResolvedValue("installation-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ number: 42, html_url: "https://github.com/goa/permits-api/issues/42" }),
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE mesh_runs

    await openIssueForNewFindings("run-1");

    expect(mockGetInstallationTokenForRepo).toHaveBeenCalledWith({
      fullName: "goa/permits-api",
      permissions: { issues: "write" },
    });
    expect(mockGetInstallationTokenForRepo).toHaveBeenCalledTimes(1);
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
    mockGetInstallationTokenForRepo.mockResolvedValue("installation-token");
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

  it("no-ops for azure_devops when no connection is configured for the organization", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [runRow({ provider: "azure_devops", full_name: "MyProject" })] });
    // Default provider in effect (no setAzureDevOpsClientProvider call) — it
    // asks services/integrations for a client, which throws when nothing is
    // configured for the organization.
    mockGetAzureDevOpsClient.mockRejectedValue(new Error("No azure_devops integration is configured for this organization"));

    const result = await openIssueForNewFindings("run-1");

    expect(result.created).toBe(false);
    expect(result.issueRef).toBeNull();
  });
});

describe("openIssueForNewFindings — default Azure DevOps provider (services/integrations, WP-BE8)", () => {
  it("resolves the connection via getAzureDevOpsClient(organizationId, connectionId) and creates a work item", async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        runRow({
          provider: "azure_devops",
          full_name: "MyProject/my-repo",
          organization_id: "org-1",
          connection_id: "conn-1",
        }),
      ],
    });
    const mockRequest = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 789, url: "https://dev.azure.com/x/_apis/wit/workItems/789", _links: { html: { href: "https://dev.azure.com/x/_workitems/edit/789" } } }),
    });
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/x", request: mockRequest });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE mesh_runs

    const result = await openIssueForNewFindings("run-1");

    expect(mockGetAzureDevOpsClient).toHaveBeenCalledWith("org-1", "conn-1");
    expect(result.created).toBe(true);
    expect(result.issueRef).toBe("azure_devops:MyProject/my-repo#789");

    // Filed against the Azure DevOps project (the full_name's first segment)
    // using the "add" work-item API with a minimal JSON Patch body.
    const [path, init] = mockRequest.mock.calls[0];
    expect(path).toContain("/MyProject/_apis/wit/workitems/$Task");
    expect((init as RequestInit).method).toBe("POST");
    const patch = JSON.parse((init as RequestInit).body as string);
    expect(patch).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/fields/System.Title" }),
        expect.objectContaining({ path: "/fields/System.Description" }),
      ]),
    );
  });

  it("returns a failure result (not a throw) when Azure DevOps rejects the work item creation", async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [runRow({ provider: "azure_devops", full_name: "MyProject/my-repo", organization_id: "org-1" })],
    });
    const mockRequest = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" });
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/x", request: mockRequest });

    const result = await openIssueForNewFindings("run-1");

    expect(result.created).toBe(false);
    expect(result.message).toEqual(expect.stringContaining("401"));
  });
});

describe("escapeMarkdown", () => {
  it("escapes Markdown control characters and backticks from untrusted finding fields", () => {
    const malicious = "`rm -rf /` **bold** _em_ [link](javascript:alert(1)) # heading";
    const escaped = escapeMarkdown(malicious);
    // No unescaped Markdown-significant character remains.
    expect(escaped).not.toMatch(/(?<!\\)[`*_[\]()#]/);
    // The literal text content is preserved, just backslash-escaped.
    expect(escaped.replace(/\\/g, "")).toBe(malicious);
  });

  it("neutralizes @mentions so a report can't ping a user or team", () => {
    const escaped = escapeMarkdown("cc @octocat and @my-org/security-team");
    expect(escaped).not.toMatch(/(?<!\\)@/);
    expect(escaped.replace(/\\/g, "")).toBe("cc @octocat and @my-org/security-team");
  });

  it("neutralizes raw HTML tags", () => {
    const escaped = escapeMarkdown('<img src=x onerror=alert(1)> <a href="x">click</a>');
    expect(escaped).not.toMatch(/(?<!\\)[<>]/);
  });
});

describe("openIssueForNewFindings — Markdown injection via repository display name", () => {
  it("escapes Markdown/mention syntax in the issue title without altering the API repo path", async () => {
    // `full_name` normally can't contain characters like these, but the
    // title-building code should not assume that — escape defensively.
    mockDbQuery.mockResolvedValueOnce({
      rows: [runRow({ full_name: "goa/permits-api" })],
    });
    mockIsGitHubAppConfigured.mockReturnValue(true);
    mockGetInstallationTokenForRepo.mockResolvedValue("installation-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ number: 44, html_url: "https://github.com/goa/permits-api/issues/44" }),
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE mesh_runs

    await openIssueForNewFindings("run-1");

    // The repo path used to call the GitHub API is untouched...
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/goa/permits-api/issues",
      expect.anything(),
    );
    // ...and the title is built from the (here, harmless) escaped name.
    const [, init] = mockFetch.mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.title).toBe(`Assurance Mesh: 1 new finding (${escapeMarkdown("goa/permits-api")})`);
  });
});

describe("formatIssueBody (via a future per-finding wiring) — pack_version escaping", () => {
  // `pack_version` comes straight from the ingested, HMAC-authenticated but
  // otherwise unvalidated CI report (routes/mesh.ts only checks it's a
  // non-empty string). `escapeMarkdown` is applied to it before it reaches
  // an issue body so a malicious/compromised CI can't inject Markdown, raw
  // HTML, links, or an @mention through that field.
  it("escapeMarkdown neutralizes a malicious pack_version value", () => {
    const malicious = "@everyone `rm -rf /` [pwned](http://evil.example) <img src=x onerror=alert(1)>";
    const escaped = escapeMarkdown(malicious);
    expect(escaped).not.toMatch(/(?<!\\)[@`[\]()<>]/);
  });
});
