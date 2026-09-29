import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * AdminIntegrations (T136, WP-A6, NA-08). Covers the org-admin gate (a
 * non-admin gets a no-access state, never the forms) and that a loaded page
 * renders the GitHub App / Azure DevOps / mesh policy sections for an org
 * admin -- see contracts/routes.md `/admin/integrations` and FR-013.
 */

const useAdminMock = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => useAdminMock(),
}));

const getMock = vi.fn();
const putMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    put: (...args: unknown[]) => putMock(...args),
  },
}));

const orgRowsMock = vi.fn();
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    from: () => ({ select: () => ({ limit: () => orgRowsMock() }) }),
  },
}));

import { AdminIntegrations } from "../AdminIntegrations";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/integrations"]}>
        <AdminIntegrations />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminIntegrations", () => {
  beforeEach(() => {
    useAdminMock.mockReset();
    getMock.mockReset();
    putMock.mockReset();
    orgRowsMock.mockReset();
  });

  it("shows a no-access state for a non-admin, without calling the admin endpoint", async () => {
    useAdminMock.mockReturnValue({ isAdmin: false, loading: false });
    renderPage();

    expect(await screen.findByText("Organization admins only")).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalledWith("/api/v1/admin/integrations");
  });

  it("renders GitHub App, Azure DevOps and mesh policy sections for an org admin", async () => {
    useAdminMock.mockReturnValue({ isAdmin: true, loading: false });
    getMock.mockImplementation(async (url: string) => {
      if (url === "/api/v1/admin/integrations") {
        return {
          githubApp: { configured: true, installationId: "1", accountLogin: "goa-standards", ok: true },
          githubAppConnections: [
            {
              id: "conn-1",
              provider: "github_app",
              authType: "app_installation",
              displayName: "GOA GitHub import",
              scope: { owners: ["goa-standards"] },
              status: "ok",
              lastTestedAt: "2026-09-27T00:00:00Z",
              createdAt: "2026-09-01T00:00:00Z",
              hasSecret: false,
            },
          ],
          azureDevOps: [],
        };
      }
      if (url === "/api/v1/teams/mine") return [];
      if (url === "/api/v1/teams") return [{ id: "t1", name: "Permits", organization_id: "org1", member_count: 1, application_count: 1 }];
      if (url.startsWith("/api/v1/mesh/policy")) {
        return {
          scope: "organization",
          scopeId: "org1",
          effective: { green: "issue", yellow: "issue", red: "issue", blue: "issue" },
          cyberRiskSandbox: false,
          explicit: [],
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    renderPage();

    expect(await screen.findByTestId("integrations-github-app")).toBeInTheDocument();
    expect(screen.getByTestId("integrations-azure-devops")).toBeInTheDocument();
    expect(screen.getByTestId("integrations-mesh-policy")).toBeInTheDocument();
    expect(screen.getByDisplayValue("GOA GitHub import")).toBeInTheDocument();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith("/api/v1/mesh/policy?scope=organization&scopeId=org1"));
  });

  it("sets the org policy for an org admin with zero teams (org id from the organization row)", async () => {
    useAdminMock.mockReturnValue({ isAdmin: true, loading: false });
    orgRowsMock.mockResolvedValue({ data: [{ id: "org-fallback" }] });
    getMock.mockImplementation(async (url: string) => {
      if (url === "/api/v1/admin/integrations") {
        return {
          githubApp: { configured: true, installationId: "1", accountLogin: "goa-standards", ok: true },
          githubAppConnections: [],
          azureDevOps: [],
        };
      }
      if (url === "/api/v1/teams/mine" || url === "/api/v1/teams") return [];
      if (url.startsWith("/api/v1/mesh/policy")) {
        return {
          scope: "organization",
          scopeId: "org-fallback",
          effective: { green: "issue", yellow: "issue", red: "issue", blue: "issue" },
          cyberRiskSandbox: false,
          explicit: [],
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    renderPage();

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith("/api/v1/mesh/policy?scope=organization&scopeId=org-fallback"),
    );
  });
});
