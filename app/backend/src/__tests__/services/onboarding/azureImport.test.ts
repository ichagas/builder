/**
 * Unit tests for Azure Repos import (spec 007, WP-BE5, fix round 1 item 5;
 * fix round 2 items 1/9: adoOrg-qualified full_name, sanitized errors).
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

  it("lists repositories across every project the connection can see, qualified with the ADO org login", async () => {
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
      { fullName: "goa/ProjectA/repo-a", adoOrg: "goa", project: "ProjectA", defaultBranch: "main", disabled: false },
      { fullName: "goa/ProjectB/repo-b", adoOrg: "goa", project: "ProjectB", defaultBranch: "develop", disabled: false },
    ]);
  });

  it("derives the ADO org login from a *.visualstudio.com organization URL too", async () => {
    const request = jest.fn(async (path: string) => {
      if (path.includes("/_apis/projects?")) return { ok: true, json: async () => ({ value: [{ name: "Proj" }] }) };
      return { ok: true, json: async () => ({ value: [{ name: "repo", defaultBranch: "refs/heads/main" }] }) };
    });
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://goa-standards.visualstudio.com", request });

    const repos = await listAzureDevOpsRepositories("org-1", undefined, undefined);

    expect(repos[0].fullName).toBe("goa-standards/Proj/repo");
    expect(repos[0].adoOrg).toBe("goa-standards");
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

    expect(repos).toEqual([{ fullName: "goa/OK/repo", adoOrg: "goa", project: "OK", defaultBranch: "main", disabled: false }]);
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

    expect(repos.map((r) => r.fullName)).toEqual(["goa/Proj/permits-api"]);
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

  it("throws a generic, sanitized error (not the raw status/body) when the projects list itself fails", async () => {
    const request = jest.fn(async () => ({ ok: false, status: 500, text: async () => "internal Azure DevOps stack trace" }));
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://dev.azure.com/goa", request });

    await expect(listAzureDevOpsRepositories("org-1", undefined, undefined)).rejects.toThrow(
      /Could not list Azure DevOps repositories/
    );
    await expect(listAzureDevOpsRepositories("org-1", undefined, undefined)).rejects.not.toThrow(/500/);
  });

  it("throws a generic error when the connection's organizationUrl isn't a recognized ADO shape", async () => {
    const request = jest.fn();
    mockGetAzureDevOpsClient.mockResolvedValue({ organizationUrl: "https://not-azure-devops.example.com/org", request });

    await expect(listAzureDevOpsRepositories("org-1", undefined, undefined)).rejects.toThrow(
      /Could not list Azure DevOps repositories/
    );
    expect(request).not.toHaveBeenCalled();
  });
});
