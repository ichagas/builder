import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeamPortfolio } from "../TeamPortfolio";

const useAdminMock = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => useAdminMock(),
}));

const getMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...args: unknown[]) => getMock(...args) },
}));

const channelMock = { on: vi.fn(), subscribe: vi.fn() };
channelMock.on.mockReturnValue(channelMock);
channelMock.subscribe.mockReturnValue(channelMock);
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    channel: () => channelMock,
    removeChannel: vi.fn(),
  },
}));

const TEAM_ID = "00000000-0000-4000-8000-000000000801";

function repo(overrides: Record<string, unknown>) {
  return {
    id: "r1",
    provider: "github",
    full_name: "e2e-goa/permits-api",
    default_branch: "main",
    ci_provider: "github_actions",
    profile: "dotnet",
    stack_label: ".NET 8",
    part: "api",
    pinned_pack: "2026.2",
    update_pr_number: null,
    update_pr_state: null,
    last_report_at: "2026-09-27T00:00:00Z",
    not_reporting: false,
    ...overrides,
  };
}

function portfolioResponse() {
  return {
    teamId: TEAM_ID,
    applications: [
      {
        id: "a1",
        name: "Permits API",
        owner_label: "Permits squad",
        onboarded_at: "2026-08-01T00:00:00Z",
        repositories: [
          repo({ id: "r1", full_name: "e2e-goa/permits-api" }),
          repo({ id: "r2", full_name: "e2e-goa/permits-worker", pinned_pack: "2026.1", not_reporting: true, last_report_at: null }),
        ],
        repository_count: 2,
        not_reporting_count: 1,
      },
    ],
    totals: { applications: 1, repositories: 2, notReporting: 1 },
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/assurance/t/${TEAM_ID}`]}>
        <Routes>
          <Route path="/assurance/t/:teamId" element={<TeamPortfolio />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeamPortfolio (NA-02)", () => {
  beforeEach(() => {
    getMock.mockReset();
    useAdminMock.mockReturnValue({ isAdmin: false });
  });

  it("renders applications with adoption and the not-reporting count", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [{ id: TEAM_ID, name: "Permits Platform", organization_id: "org1", role: "owner" }];
      }
      if (path === `/api/v1/teams/${TEAM_ID}/portfolio`) {
        return portfolioResponse();
      }
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Permits Platform" })).toBeInTheDocument();
    expect(await screen.findByText("Permits API")).toBeInTheDocument();
    // AdoptionBar (role="img") summarizes the pack split for this app's repos.
    expect(screen.getByRole("img", { name: /1 on 2026.1, 1 on 2026.2/ })).toBeInTheDocument();
    expect(screen.getByText("1 not reporting")).toBeInTheDocument();
    expect(screen.getByText("e2e-goa/permits-worker")).toBeInTheDocument();
    expect(screen.getAllByText("Not reporting").length).toBeGreaterThan(0);
  });

  it("filters to not-reporting repositories via the banner CTA and FilterChips (URL-held)", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [{ id: TEAM_ID, name: "Permits Platform", organization_id: "org1", role: "owner" }];
      }
      if (path === `/api/v1/teams/${TEAM_ID}/portfolio`) {
        return portfolioResponse();
      }
      throw new Error(`unexpected path ${path}`);
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("e2e-goa/permits-api");
    expect(screen.getByText("e2e-goa/permits-worker")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show repositories/i }));
    await waitFor(() => expect(screen.queryByText("e2e-goa/permits-api")).not.toBeInTheDocument());
    expect(screen.getByText("e2e-goa/permits-worker")).toBeInTheDocument();
  });

  it("shows an empty state when the team has no applications", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [{ id: TEAM_ID, name: "Permits Platform", organization_id: "org1", role: "owner" }];
      }
      if (path === `/api/v1/teams/${TEAM_ID}/portfolio`) {
        return { teamId: TEAM_ID, applications: [], totals: { applications: 0, repositories: 0, notReporting: 0 } };
      }
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();
    expect(await screen.findByText("No applications yet")).toBeInTheDocument();
  });

  it("shows an error state when the portfolio request fails", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") return [];
      if (path === `/api/v1/teams/${TEAM_ID}/portfolio`) {
        throw { message: "Not found", statusCode: 404 };
      }
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();
    expect(await screen.findByText("Team not found")).toBeInTheDocument();
  });
});
