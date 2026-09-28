import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useAdminIntegrations,
  useCreateGitHubAppConnection,
  useCreateAzureDevOpsConnection,
  useTestConnection,
  useDeleteConnection,
  githubAppOwners,
  azureDevOpsOrgUrl,
} from "../api";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const CONNECTION = {
  id: "conn-1",
  provider: "github_app" as const,
  authType: "app_installation" as const,
  displayName: "GOA GitHub import",
  scope: { owners: ["goa-standards"] },
  status: "untested" as const,
  lastTestedAt: null,
  createdAt: "2026-09-01T00:00:00Z",
  hasSecret: false,
};

describe("integrations api", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
  });

  it("useAdminIntegrations parses GET /admin/integrations", async () => {
    getMock.mockResolvedValueOnce({
      githubApp: { configured: true, installationId: "1", accountLogin: "goa-standards", ok: true },
      githubAppConnections: [CONNECTION],
      azureDevOps: [],
    });
    const { result } = renderHook(() => useAdminIntegrations(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/admin/integrations");
    expect(result.current.data?.githubAppConnections).toHaveLength(1);
  });

  it("useAdminIntegrations surfaces a parse error for a malformed response", async () => {
    getMock.mockResolvedValueOnce({ githubApp: {}, githubAppConnections: [], azureDevOps: [] });
    const { result } = renderHook(() => useAdminIntegrations(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useCreateGitHubAppConnection posts provider/displayName/owners", async () => {
    postMock.mockResolvedValueOnce(CONNECTION);
    const { result } = renderHook(() => useCreateGitHubAppConnection(), { wrapper });
    result.current.mutate({ displayName: "GOA GitHub import", owners: ["goa-standards"] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith("/api/v1/admin/integrations", {
      provider: "github_app",
      displayName: "GOA GitHub import",
      owners: ["goa-standards"],
    });
  });

  it("useCreateAzureDevOpsConnection posts the connection body and never a returned secret", async () => {
    const azureConnection = { ...CONNECTION, id: "conn-2", provider: "azure_devops" as const, authType: "pat" as const, hasSecret: true };
    postMock.mockResolvedValueOnce(azureConnection);
    const { result } = renderHook(() => useCreateAzureDevOpsConnection(), { wrapper });
    result.current.mutate({
      displayName: "GOA ADO",
      organizationUrl: "https://dev.azure.com/goa-standards",
      authType: "pat",
      patValue: "secret-value",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/admin/integrations",
      expect.objectContaining({ authType: "pat", patValue: "secret-value" }),
    );
    // The response the hook resolves with never carries a secret value.
    expect(result.current.data).not.toHaveProperty("patValue");
    expect(result.current.data?.hasSecret).toBe(true);
  });

  it("useTestConnection posts to /:id/test and surfaces testError", async () => {
    postMock.mockResolvedValueOnce({ ...CONNECTION, status: "failing", testError: "not reachable" });
    const { result } = renderHook(() => useTestConnection(), { wrapper });
    result.current.mutate("conn-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith("/api/v1/admin/integrations/conn-1/test", undefined);
    expect(result.current.data?.testError).toBe("not reachable");
  });

  it("useDeleteConnection deletes by id", async () => {
    deleteMock.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useDeleteConnection(), { wrapper });
    result.current.mutate("conn-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteMock).toHaveBeenCalledWith("/api/v1/admin/integrations/conn-1");
  });

  it("githubAppOwners/azureDevOpsOrgUrl read the loosely-typed scope", () => {
    expect(githubAppOwners(CONNECTION)).toEqual(["goa-standards"]);
    expect(azureDevOpsOrgUrl({ ...CONNECTION, scope: { organizationUrl: "https://dev.azure.com/goa" } })).toBe(
      "https://dev.azure.com/goa",
    );
    expect(azureDevOpsOrgUrl(CONNECTION)).toBe("");
  });
});
