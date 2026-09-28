import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Application } from "../Application";

const useAdminMock = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => useAdminMock(),
}));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...args: unknown[]) => getMock(...args), post: (...args: unknown[]) => postMock(...args) },
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
const APP_ID = "00000000-0000-4000-8000-000000000811";

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
    latest_run: null,
    ...overrides,
  };
}

function applicationResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    team_id: TEAM_ID,
    name: "Permits API",
    owner_label: "Permits squad",
    onboarded_at: "2026-08-01T00:00:00Z",
    repositories: [
      repo({ id: "r1", full_name: "e2e-goa/permits-api", pinned_pack: "2026.2" }),
      repo({
        id: "r2",
        full_name: "e2e-goa/permits-worker",
        part: "worker",
        pinned_pack: "2026.1",
        latest_run: {
          run_id: "run-1",
          verdicts: { green: "pass", yellow: "warn", red: "pass", blue: "pass" },
          pr_state: "open",
          pr_number: 214,
          new_findings: 2,
          received_at: "2026-09-20T00:00:00Z",
        },
      }),
    ],
    adoption: { latestPackVersion: "2026.2", reposOnLatest: 1, totalRepos: 2, ratio: 0.5 },
    exceptions: [
      { id: "exc-1", repository_id: "r1", rule: "Red recon", reason: "Batch job", approved_by: "profile-1", expires_at: "2099-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
    ],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/assurance/t/${TEAM_ID}/apps/${APP_ID}`]}>
        <Routes>
          <Route path="/assurance/t/:teamId/apps/:appId" element={<Application />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Application (NA-03/NA-04)", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    useAdminMock.mockReturnValue({ isAdmin: false });
  });

  it("renders repositories grouped by part, with adoption, mesh verdicts and exceptions", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [{ id: TEAM_ID, name: "Permits Platform", organization_id: "org1", role: "owner" }];
      }
      if (path === `/api/v1/applications/${APP_ID}`) return applicationResponse();
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Permits API" })).toBeInTheDocument();
    expect((await screen.findAllByText("e2e-goa/permits-api")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("e2e-goa/permits-worker").length).toBeGreaterThan(0);
    // Adoption bar summarizes the pack split (1 on 2026.1, 1 on 2026.2).
    expect(screen.getByRole("img", { name: /1 on 2026\.1, 1 on 2026\.2/ })).toBeInTheDocument();
    // Group headers ("api", "worker") come from `part`.
    expect(screen.getByText(/api · 1/)).toBeInTheDocument();
    expect(screen.getByText(/worker · 1/)).toBeInTheDocument();
    // Exceptions disclosure.
    expect(screen.getByText(/Exceptions · 1/)).toBeInTheDocument();
  });

  it("sends update PRs for a group after confirmation", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [{ id: TEAM_ID, name: "Permits Platform", organization_id: "org1", role: "owner" }];
      }
      if (path === `/api/v1/applications/${APP_ID}`) return applicationResponse();
      throw new Error(`unexpected path ${path}`);
    });
    postMock.mockResolvedValue({ packVersion: "2026.2", results: [{ repositoryId: "r2", opened: true, prNumber: 99 }] });

    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("e2e-goa/permits-worker");
    // permits-worker is behind (2026.1) with no open update PR -- its group ("worker") gets a send button.
    const sendButton = screen.getByRole("button", { name: /send update pr \(1\)/i });
    await user.click(sendButton);
    // First click arms ActionButton's confirmation; second click runs it.
    await user.click(screen.getByRole("button", { name: /send 1 update pr\?/i }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(`/api/v1/applications/${APP_ID}/update-prs`, { repositoryIds: ["r2"] }),
    );
  });

  it("requests an exception for a repository", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") {
        return [{ id: TEAM_ID, name: "Permits Platform", organization_id: "org1", role: "owner" }];
      }
      if (path === `/api/v1/applications/${APP_ID}`) return applicationResponse();
      throw new Error(`unexpected path ${path}`);
    });
    postMock.mockResolvedValue({
      id: "exc-2",
      repository_id: "r1",
      rule: "Red recon",
      reason: null,
      approved_by: "profile-1",
      expires_at: "2027-01-01T00:00:00Z",
      created_at: "2026-09-28T00:00:00Z",
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("e2e-goa/permits-api");
    await user.click(screen.getByText(/Exceptions · 1/));
    await user.type(screen.getByLabelText("Rule"), "Red recon");
    await user.type(screen.getByLabelText("Expires"), "2027-01-01");
    await user.click(screen.getByRole("button", { name: "Request exception" }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/mesh/exceptions", {
        repositoryId: "r1",
        rule: "Red recon",
        reason: undefined,
        expiresAt: "2027-01-01",
      }),
    );
  });

  it("shows an error state when the application request fails", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams/mine") return [];
      if (path === `/api/v1/applications/${APP_ID}`) throw { message: "Not found", statusCode: 404 };
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();
    expect(await screen.findByText("Application not found")).toBeInTheDocument();
  });
});
