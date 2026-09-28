import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTeamsMine, useTeamsAll, useTeamPortfolio } from "../api";

const getMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...args: unknown[]) => getMock(...args) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("assurance api", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("useTeamsMine parses GET /teams/mine", async () => {
    getMock.mockResolvedValueOnce([{ id: "t1", name: "Permits", organization_id: "org1", role: "owner" }]);
    const { result } = renderHook(() => useTeamsMine(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/teams/mine");
    expect(result.current.data).toEqual([{ id: "t1", name: "Permits", organization_id: "org1", role: "owner" }]);
  });

  it("useTeamsMine surfaces a parse error for a malformed response", async () => {
    getMock.mockResolvedValueOnce([{ id: "t1" }]);
    const { result } = renderHook(() => useTeamsMine(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("useTeamsAll coerces string counts and is disabled when told to be", async () => {
    getMock.mockResolvedValueOnce([
      { id: "t2", name: "Licensing", organization_id: "org1", member_count: "3", application_count: "1" },
    ]);
    const { result, rerender } = renderHook(({ enabled }) => useTeamsAll(enabled), {
      wrapper,
      initialProps: { enabled: false },
    });
    expect(result.current.fetchStatus).toBe("idle");
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: "t2", name: "Licensing", organization_id: "org1", member_count: 3, application_count: 1 },
    ]);
  });

  it("useTeamPortfolio parses the portfolio aggregate and stays disabled without a teamId", async () => {
    const { result } = renderHook(() => useTeamPortfolio(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");

    getMock.mockResolvedValueOnce({
      teamId: "t1",
      applications: [
        {
          id: "a1",
          name: "Permits API",
          owner_label: "Permits squad",
          onboarded_at: "2026-08-01T00:00:00Z",
          repositories: [
            {
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
            },
          ],
          repository_count: 1,
          not_reporting_count: 0,
        },
      ],
      totals: { applications: 1, repositories: 1, notReporting: 0 },
    });
    const { result: r2 } = renderHook(() => useTeamPortfolio("t1"), { wrapper });
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/teams/t1/portfolio");
    expect(r2.current.data?.totals.repositories).toBe(1);
  });
});
