/**
 * Unit tests for Azure Repos import (spec 007, WP-BE5, fix round 1 item 5).
 */
jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../../services/integrations", () => ({
  getAzureDevOpsClient: jest.fn(),
}));

import { getAzureDevOpsClient } from "../../../services/integrations";
import { listAzureDevOpsRepositories } from "../../../services/onboarding/azureImport";

const mockGetAzureDevOpsClient = getAzureDevOpsClient as jest.Mock;

describe("listAzureDevOpsRepositories", () => {
  afterEach(() => jest.resetAllMocks());

  it("lists repositories across every project the connection can see", async () => {
    const request = jest.fn(async (path: string) => {
      if (path.includes("/_apis/projects?")) {
        return { ok: true, json: async () => ({ value: [{ name: "ProjectA" }, { name: "ProjectB" }] }) };
      }
      if (path.startsWith("/ProjectA/_apis/git/repositories")) {
        return { ok: true, json: async () => ({ value: [{ name: "repo-a", defaultBranch: "refs/heads/main" }] }) };
      }
      if (path.startsWith("/ProjectB/_apis/git/repositories")) {
        return { ok: true, json: async () => ({ value: [{ name: "repo-b", defaultBranch: "refs/heads/develop" }] }) };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/goa", request });

    const repos = await listAzureDevOpsRepositories("org-1", "conn-1", undefined);

    expect(repos).toEqual([
      { fullName: "ProjectA/repo-a", project: "ProjectA", defaultBranch: "main", disabled: false },
      { fullName: "ProjectB/repo-b", project: "ProjectB", defaultBranch: "develop", disabled: false },
    ]);
  });

  it("skips a project whose repositories can't be listed instead of failing the whole call", async () => {
    const request = jest.fn(async (path: string) => {
      if (path.includes("/_apis/projects?")) {
        return { ok: true, json: async () => ({ value: [{ name: "Forbidden" }, { name: "OK" }] }) };
      }
      if (path.startsWith("/Forbidden/")) {
        return { ok: false, status: 403 };
      }
      if (path.startsWith("/OK/")) {
        return { ok: true, json: async () => ({ value: [{ name: "repo", defaultBranch: "refs/heads/main" }] }) };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/goa", request });

    const repos = await listAzureDevOpsRepositories("org-1", undefined, undefined);

    expect(repos).toEqual([{ fullName: "OK/repo", project: "OK", defaultBranch: "main", disabled: false }]);
  });

  it("filters by a case-insensitive substring query", async () => {
    const request = jest.fn(async (path: string) => {
      if (path.includes("/_apis/projects?")) return { ok: true, json: async () => ({ value: [{ name: "Proj" }] }) };
      return {
        ok: true,
        json: async () => ({
          value: [
            { name: "permits-api", defaultBranch: "refs/heads/main" },
            { name: "health-portal", defaultBranch: "refs/heads/main" },
          ],
        }),
      };
    });
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/goa", request });

    const repos = await listAzureDevOpsRepositories("org-1", undefined, "PERMITS");

    expect(repos.map((r) => r.fullName)).toEqual(["Proj/permits-api"]);
  });

  it("marks a disabled repository", async () => {
    const request = jest.fn(async (path: string) => {
      if (path.includes("/_apis/projects?")) return { ok: true, json: async () => ({ value: [{ name: "Proj" }] }) };
      return { ok: true, json: async () => ({ value: [{ name: "archived-repo", isDisabled: true }] }) };
    });
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/goa", request });

    const repos = await listAzureDevOpsRepositories("org-1", undefined, undefined);

    expect(repos[0].disabled).toBe(true);
  });

  it("throws when the projects list itself fails", async () => {
    const request = jest.fn(async () => ({ ok: false, status: 500 }));
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/goa", request });

    await expect(listAzureDevOpsRepositories("org-1", undefined, undefined)).rejects.toThrow(/500/);
  });
});
