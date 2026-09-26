/**
 * Unit tests for GitHub repository import (spec 007, WP-BE5).
 */
jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../../utils/githubAppAuth", () => ({
  isGitHubAppConfigured: jest.fn(),
  getInstallationToken: jest.fn(),
}));

import { isGitHubAppConfigured, getInstallationToken } from "../../../utils/githubAppAuth";
import { listGitHubRepositories } from "../../../services/onboarding/githubImport";

const mockIsConfigured = isGitHubAppConfigured as jest.Mock;
const mockGetToken = getInstallationToken as jest.Mock;

function repo(fullName: string, owner: string) {
  return {
    full_name: fullName,
    default_branch: "main",
    private: true,
    archived: false,
    html_url: `https://github.com/${fullName}`,
    owner: { login: owner },
  };
}

describe("listGitHubRepositories", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it("throws a clear error when the GitHub App isn't configured, without calling fetch", async () => {
    mockIsConfigured.mockReturnValue(false);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(listGitHubRepositories()).rejects.toThrow("GitHub App is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists and maps repositories from a single page", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockResolvedValue("installation-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ repositories: [repo("goa/permits-api", "goa"), repo("goa/health-portal", "goa")] }),
    }) as unknown as typeof fetch;

    const repos = await listGitHubRepositories();

    expect(repos).toHaveLength(2);
    expect(repos[0]).toEqual({
      fullName: "goa/permits-api",
      defaultBranch: "main",
      private: true,
      archived: false,
      htmlUrl: "https://github.com/goa/permits-api",
    });
  });

  it("filters by org and by a case-insensitive query", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockResolvedValue("installation-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        repositories: [repo("goa/permits-api", "goa"), repo("other-org/permits-clone", "other-org")],
      }),
    }) as unknown as typeof fetch;

    const byOrg = await listGitHubRepositories({ org: "goa" });
    expect(byOrg.map((r) => r.fullName)).toEqual(["goa/permits-api"]);

    const byQuery = await listGitHubRepositories({ query: "PERMITS" });
    expect(byQuery.map((r) => r.fullName).sort()).toEqual(["goa/permits-api", "other-org/permits-clone"]);
  });

  it("paginates until a short page is returned", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockResolvedValue("installation-token");

    const fullPage = Array.from({ length: 100 }, (_, i) => repo(`goa/repo-${i}`, "goa"));
    const secondPage = [repo("goa/repo-last", "goa")];

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ repositories: fullPage }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ repositories: secondPage }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const repos = await listGitHubRepositories();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(repos).toHaveLength(101);
  });

  it("throws when GitHub returns a non-2xx status", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetToken.mockResolvedValue("installation-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    }) as unknown as typeof fetch;

    await expect(listGitHubRepositories()).rejects.toThrow("GitHub API returned 403");
  });
});
