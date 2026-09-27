/**
 * Unit tests for the onboarding organization repository scope (spec 007,
 * WP-BE5, fix round 3 item 6 — security).
 */
jest.mock("../../../services/integrations", () => ({
  getDefaultConnectionForProvider: jest.fn(),
  getConnection: jest.fn(),
}));

import { getDefaultConnectionForProvider, getConnection } from "../../../services/integrations";
import {
  getAllowedGitHubOwners,
  getAllowedAzureDevOpsOrg,
  listRepositoriesOutsideOrgScope,
  assertRepositoryInOrgScope,
  RepositoryOutOfScopeError,
} from "../../../services/onboarding/repositoryScope";

const mockDefault = getDefaultConnectionForProvider as jest.Mock;
const mockGetConnection = getConnection as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockDefault.mockResolvedValue({ provider: "github_app", scope: { owners: ["goa", "goa-labs"] } });
  mockGetConnection.mockResolvedValue({ provider: "azure_devops", scope: { organizationUrl: "https://contoso.visualstudio.com" } });
});

describe("getAllowedGitHubOwners", () => {
  it("reads the organization's github_app connection owners, lowercased and de-duplicated", async () => {
    mockDefault.mockResolvedValue({ scope: { owners: ["GoA", "goa", " labs "] } });
    await expect(getAllowedGitHubOwners("org-1")).resolves.toEqual(["goa", "labs"]);
    expect(mockDefault).toHaveBeenCalledWith("org-1", "github_app");
  });

  it("falls back to the legacy single `owner` and ignores non-string junk", async () => {
    mockDefault.mockResolvedValue({ scope: { owner: "Legacy" } });
    await expect(getAllowedGitHubOwners("org-1")).resolves.toEqual(["legacy"]);
    mockDefault.mockResolvedValue({ scope: { owners: [42, null, ""] } });
    await expect(getAllowedGitHubOwners("org-1")).resolves.toEqual([]);
  });

  it("is empty with no connection", async () => {
    mockDefault.mockResolvedValue(null);
    await expect(getAllowedGitHubOwners("org-1")).resolves.toEqual([]);
  });
});

describe("getAllowedAzureDevOpsOrg", () => {
  it("derives the org login from the resolved connection (both URL shapes), lowercased", async () => {
    await expect(getAllowedAzureDevOpsOrg("org-1", "conn-9")).resolves.toBe("contoso");
    expect(mockGetConnection).toHaveBeenCalledWith("org-1", "azure_devops", "conn-9");
    mockGetConnection.mockResolvedValue({ scope: { organizationUrl: "https://dev.azure.com/Fabrikam" } });
    await expect(getAllowedAzureDevOpsOrg("org-1")).resolves.toBe("fabrikam");
  });

  it("is null when no usable connection resolves (none, wrong provider, cross-org id)", async () => {
    mockGetConnection.mockRejectedValue(new Error("not found for this organization"));
    await expect(getAllowedAzureDevOpsOrg("org-1", "other-orgs-conn")).resolves.toBeNull();
  });
});

describe("listRepositoriesOutsideOrgScope", () => {
  it("returns only the out-of-scope repositories, in order, loading each provider's scope once", async () => {
    const violations = await listRepositoriesOutsideOrgScope("org-1", null, [
      "goa/a",
      "evil/b",
      "GOA-LABS/c",
      "contoso/P/r",
      "fabrikam/P/r",
      "not a name",
    ]);
    expect(violations.map((v) => v.fullName)).toEqual(["evil/b", "fabrikam/P/r", "not a name"]);
    expect(mockDefault).toHaveBeenCalledTimes(1);
    expect(mockGetConnection).toHaveBeenCalledTimes(1);
  });

  it("does not look up a provider's scope when no repository of that provider is present", async () => {
    await listRepositoriesOutsideOrgScope("org-1", null, ["goa/a"]);
    expect(mockGetConnection).not.toHaveBeenCalled();
  });
});

describe("assertRepositoryInOrgScope", () => {
  it("throws RepositoryOutOfScopeError for a cross-org repository and resolves for an in-scope one", async () => {
    await expect(assertRepositoryInOrgScope("org-1", null, "goa/a")).resolves.toBeUndefined();
    await expect(assertRepositoryInOrgScope("org-1", null, "other-tenant/a")).rejects.toBeInstanceOf(RepositoryOutOfScopeError);
  });
});
