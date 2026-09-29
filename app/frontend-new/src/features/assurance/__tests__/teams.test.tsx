import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AllTeams from "@/pages/assurance/AllTeams";
import { latestPackOf } from "../teams.api";
import "@/i18n";

const useAdminMock = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({ useAdmin: () => useAdminMock() }));

const getMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({ default: { get: (...args: unknown[]) => getMock(...args) } }));

const repo = (id: string, pack: string | null, notReporting = false) => ({
  id,
  provider: "github",
  full_name: `o/${id}`,
  default_branch: "main",
  ci_provider: null,
  profile: null,
  stack_label: null,
  part: null,
  pinned_pack: pack,
  update_pr_number: null,
  update_pr_state: null,
  last_report_at: null,
  not_reporting: notReporting,
});
const portfolio = (teamId: string, repos: ReturnType<typeof repo>[]) => ({
  teamId,
  applications: [
    { id: `app-${teamId}`, name: "App", owner_label: null, onboarded_at: null, repositories: repos, repository_count: repos.length, not_reporting_count: repos.filter((r) => r.not_reporting).length },
  ],
  totals: { applications: 1, repositories: repos.length, notReporting: repos.filter((r) => r.not_reporting).length },
});

function renderPage(path = "/assurance/all") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AllTeams />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("latestPackOf", () => {
  it("returns the highest pinned pack across portfolios, or null", () => {
    expect(latestPackOf([])).toBeNull();
    expect(latestPackOf([portfolio("a", [repo("x", "2026.1"), repo("y", null)]), portfolio("b", [repo("z", "2026.2")])])).toBe("2026.2");
  });
});

describe("AllTeams (NA-07)", () => {
  beforeEach(() => {
    getMock.mockReset();
    useAdminMock.mockReset();
  });

  it("shows a no-access state for non-admins and never calls GET /teams", () => {
    useAdminMock.mockReturnValue({ isAdmin: false, loading: false });
    renderPage();
    expect(screen.getByText("Organization admins only")).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("lists every team with repository totals, on-latest and not-reporting, and filters", async () => {
    useAdminMock.mockReturnValue({ isAdmin: true, loading: false });
    getMock.mockImplementation(async (path: string) => {
      if (path === "/api/v1/teams") {
        return [
          { id: "t1", name: "Fleet", organization_id: "o", member_count: "1", application_count: "1" },
          { id: "t2", name: "Harbor", organization_id: "o", member_count: "2", application_count: "1" },
        ];
      }
      if (path === "/api/v1/teams/t1/portfolio") return portfolio("t1", [repo("a", "2026.2"), repo("b", "2026.1", true)]);
      if (path === "/api/v1/teams/t2/portfolio") return portfolio("t2", [repo("c", "2026.2")]);
      throw new Error(`unexpected ${path}`);
    });
    const user = userEvent.setup();
    renderPage();

    const rows = await screen.findAllByTestId("assurance-team-row");
    expect(rows).toHaveLength(2);
    await screen.findByText("1/2");
    const fleet = rows.find((r) => within(r).queryByText("Fleet"))!;
    expect(within(fleet).getByText("1/2")).toBeInTheDocument();
    expect(within(fleet).getByRole("link", { name: "Fleet" })).toHaveAttribute("href", "/assurance/t/t1");
    expect(screen.getByRole("columnheader", { name: /on 2026\.2/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^needs attention/i }));
    expect(screen.getAllByTestId("assurance-team-row")).toHaveLength(1);
  });

  it("shows a no-access state when GET /teams answers 403", async () => {
    useAdminMock.mockReturnValue({ isAdmin: true, loading: false });
    getMock.mockRejectedValue({ statusCode: 403 });
    renderPage();
    expect(await screen.findByText("Organization admins only")).toBeInTheDocument();
  });
});
