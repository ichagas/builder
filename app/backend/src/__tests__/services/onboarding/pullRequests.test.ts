/**
 * Unit tests for opening the onboarding pull request (spec 007, WP-BE5).
 */
jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../../utils/githubAppAuth", () => ({
  getInstallationTokenForRepo: jest.fn(),
}));

jest.mock("../../../services/integrations", () => ({
  getAzureDevOpsClient: jest.fn(),
}));

import { getInstallationTokenForRepo } from "../../../utils/githubAppAuth";
import { getAzureDevOpsClient } from "../../../services/integrations";
import { openRepositoryPullRequest } from "../../../services/onboarding/pullRequests";

const mockGetInstallationTokenForRepo = getInstallationTokenForRepo as jest.Mock;
const mockGetAzureDevOpsClient = getAzureDevOpsClient as jest.Mock;

const files = [{ path: ".github/workflows/assurance-mesh.yml", content: "name: assurance-mesh\n" }];

describe("openRepositoryPullRequest — github", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    mockGetInstallationTokenForRepo.mockResolvedValue("repo-scoped-token");
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  function installFetchSequence(overrides: Record<string, any> = {}) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });

      if (url.match(/\/repos\/goa\/permits-api$/)) {
        return { ok: true, json: async () => ({ default_branch: "main" }) };
      }
      if (url.includes("/git/ref/heads/main")) {
        return { ok: true, json: async () => ({ object: { sha: "base-sha" } }) };
      }
      if (url.endsWith("/git/refs") && init?.method === "POST") {
        return overrides.createRef ?? { ok: true, json: async () => ({}) };
      }
      if (url.includes("/contents/") && (!init || init.method === undefined)) {
        // GET existing file (for sha) — pretend it doesn't exist yet.
        return { ok: false, status: 404 };
      }
      if (url.includes("/contents/") && init?.method === "PUT") {
        return overrides.putFile ?? { ok: true, json: async () => ({}) };
      }
      if (url.includes("/pulls?head=")) {
        return overrides.existingPrs ?? { ok: true, json: async () => [] };
      }
      if (url.endsWith("/pulls") && init?.method === "POST") {
        return overrides.createPr ?? { ok: true, json: async () => ({ number: 42 }) };
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return { fetchMock, calls };
  }

  it("mints a token scoped to exactly the one repository via getInstallationTokenForRepo, never the shared installation token", async () => {
    installFetchSequence();

    await openRepositoryPullRequest({
      provider: "github",
      fullName: "goa/permits-api",
      organizationId: "org-1",
      branchName: "pronghorn-onboarding/abc123",
      title: "Add the Assurance Mesh CI",
      body: "body",
      files,
    });

    expect(mockGetInstallationTokenForRepo).toHaveBeenCalledWith({
      fullName: "goa/permits-api",
      permissions: { contents: "write", pull_requests: "write" },
    });
  });

  it("opens a PR and returns its number", async () => {
    installFetchSequence();

    const result = await openRepositoryPullRequest({
      provider: "github",
      fullName: "goa/permits-api",
      organizationId: "org-1",
      branchName: "pronghorn-onboarding/abc123",
      title: "Add the Assurance Mesh CI",
      body: "body",
      files,
    });

    expect(result).toEqual({ prNumber: 42, prState: "open", defaultBranch: "main" });
  });

  it("is idempotent: reuses an already-open PR from the same branch instead of opening a duplicate", async () => {
    const { fetchMock } = installFetchSequence({
      existingPrs: { ok: true, json: async () => [{ number: 7 }] },
    });

    const result = await openRepositoryPullRequest({
      provider: "github",
      fullName: "goa/permits-api",
      organizationId: "org-1",
      branchName: "pronghorn-onboarding/abc123",
      title: "Add the Assurance Mesh CI",
      body: "body",
      files,
    });

    expect(result).toEqual({ prNumber: 7, prState: "open", defaultBranch: "main" });
    const createCalls = fetchMock.mock.calls.filter(
      (call: any) => call[0].endsWith("/pulls") && call[1]?.method === "POST"
    );
    expect(createCalls).toHaveLength(0);
  });

  it("treats a 422 (branch already exists) on branch creation as a retry, not a failure", async () => {
    installFetchSequence({ createRef: { ok: false, status: 422, text: async () => "Reference already exists" } });

    await expect(
      openRepositoryPullRequest({
        provider: "github",
        fullName: "goa/permits-api",
        organizationId: "org-1",
        branchName: "pronghorn-onboarding/abc123",
        title: "Add the Assurance Mesh CI",
        body: "body",
        files,
      })
    ).resolves.toEqual({ prNumber: 42, prState: "open", defaultBranch: "main" });
  });

  it("surfaces a clear error when opening the PR fails", async () => {
    installFetchSequence({ createPr: { ok: false, status: 422, text: async () => "validation failed" } });

    await expect(
      openRepositoryPullRequest({
        provider: "github",
        fullName: "goa/permits-api",
        organizationId: "org-1",
        branchName: "pronghorn-onboarding/abc123",
        title: "Add the Assurance Mesh CI",
        body: "body",
        files,
      })
    ).rejects.toThrow(/Could not open PR/);
  });
});

describe("openRepositoryPullRequest — full_name / provider mismatch (fix round 3)", () => {
  afterEach(() => jest.resetAllMocks());

  it("refuses an Azure-shaped full_name on the github path before minting any token", async () => {
    const fetchMock = jest.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(
        openRepositoryPullRequest({
          provider: "github",
          fullName: "contoso/MyProject/permits-api",
          organizationId: "org-1",
          branchName: "b",
          title: "t",
          body: "b",
          files,
        })
      ).rejects.toThrow(/Invalid GitHub repository full name/);
    } finally {
      global.fetch = originalFetch;
    }
    expect(mockGetInstallationTokenForRepo).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a GitHub-shaped full_name on the azure_devops path before resolving a connection", async () => {
    await expect(
      openRepositoryPullRequest({
        provider: "azure_devops",
        fullName: "goa/permits-api",
        organizationId: "org-1",
        branchName: "b",
        title: "t",
        body: "b",
        files,
      })
    ).rejects.toThrow(/Invalid Azure DevOps repository full name/);
    expect(mockGetAzureDevOpsClient).not.toHaveBeenCalled();
  });
});

describe("openRepositoryPullRequest — azure_devops", () => {
  afterEach(() => jest.resetAllMocks());

  it("is idempotent: reuses an already-open PR for the source branch", async () => {
    const request = jest.fn(async (path: string) => {
      if (path.includes("/_apis/git/repositories/permits-api?")) {
        return { ok: true, json: async () => ({ id: "repo-id", defaultBranch: "refs/heads/main" }) };
      }
      if (path.includes("pullrequests?searchCriteria")) {
        return { ok: true, json: async () => ({ value: [{ pullRequestId: 99 }] }) };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/goa", request });

    const result = await openRepositoryPullRequest({
      provider: "azure_devops",
      fullName: "goa/MyProject/permits-api",
      organizationId: "org-1",
      connectionId: "conn-1",
      branchName: "pronghorn-onboarding/abc123",
      title: "Add the Assurance Mesh CI",
      body: "body",
      files,
    });

    expect(result).toEqual({ prNumber: 99, prState: "open", defaultBranch: "main" });
    expect(request).not.toHaveBeenCalledWith(expect.stringContaining("/pushes"), expect.anything());
  });

  it("pushes the generated files and opens a PR when none exists yet", async () => {
    const request = jest.fn(async (path: string, init?: RequestInit) => {
      if (path.includes("/_apis/git/repositories/permits-api?")) {
        return { ok: true, json: async () => ({ id: "repo-id", defaultBranch: "refs/heads/main" }) };
      }
      if (path.includes("pullrequests?searchCriteria")) {
        return { ok: true, json: async () => ({ value: [] }) };
      }
      if (path.includes("/refs?filter=")) {
        return { ok: true, json: async () => ({ value: [{ objectId: "old-object-id" }] }) };
      }
      if (path.includes("/pushes") && init?.method === "POST") {
        return { ok: true, json: async () => ({}) };
      }
      if (path.endsWith("/pullrequests?api-version=7.1") && init?.method === "POST") {
        return { ok: true, json: async () => ({ pullRequestId: 55 }) };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/goa", request });

    const result = await openRepositoryPullRequest({
      provider: "azure_devops",
      fullName: "goa/MyProject/permits-api",
      organizationId: "org-1",
      connectionId: "conn-1",
      branchName: "pronghorn-onboarding/abc123",
      title: "Add the Assurance Mesh CI",
      body: "body",
      files,
    });

    expect(result).toEqual({ prNumber: 55, prState: "open", defaultBranch: "main" });
  });

  it("rejects a full_name missing a segment (fix round 2: expects adoOrg/project/repo)", async () => {
    await expect(
      openRepositoryPullRequest({
        provider: "azure_devops",
        fullName: "MyProject/permits-api",
        organizationId: "org-1",
        branchName: "b",
        title: "t",
        body: "b",
        files,
      })
    ).rejects.toThrow(/expected "<adoOrg>\/<project>\/<repo>"/i);
  });

  it("rejects when the full_name's adoOrg doesn't match the resolved connection's organization (fix round 2, item 1)", async () => {
    const request = jest.fn();
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/goa", request });

    await expect(
      openRepositoryPullRequest({
        provider: "azure_devops",
        fullName: "some-other-org/MyProject/permits-api",
        organizationId: "org-1",
        connectionId: "conn-1",
        branchName: "b",
        title: "t",
        body: "b",
        files,
      })
    ).rejects.toThrow(/belongs to Azure DevOps organization "some-other-org"/i);
    expect(request).not.toHaveBeenCalled();
  });
});
