import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTeamsMine, useTeamsAll, useTeamPortfolio, useApplication, useUpdatePrs, useCreateException } from "../api";

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...args: unknown[]) => getMock(...args), post: (...args: unknown[]) => postMock(...args) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("assurance api", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
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

  it("useApplication parses GET /applications/:appId, including a repository's latest mesh run (T131, WP-A2)", async () => {
    getMock.mockResolvedValueOnce({
      id: "a1",
      team_id: "t1",
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
          latest_run: {
            run_id: "run-1",
            verdicts: { green: "pass", yellow: "pass", red: "pass", blue: "pass" },
            pr_state: "open",
            pr_number: 214,
            new_findings: 0,
            received_at: "2026-09-27T00:00:00Z",
          },
        },
      ],
      adoption: { latestPackVersion: "2026.2", reposOnLatest: 1, totalRepos: 1, ratio: 1 },
      exceptions: [],
    });

    const { result } = renderHook(() => useApplication("a1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/applications/a1");
    expect(result.current.data?.repositories[0].latest_run?.verdicts.green).toBe("pass");
  });

  it("useApplication stays disabled without an appId", () => {
    const { result } = renderHook(() => useApplication(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useUpdatePrs posts to /applications/:appId/update-prs and invalidates the application query", async () => {
    postMock.mockResolvedValueOnce({ packVersion: "2026.2", results: [{ repositoryId: "r1", opened: true, prNumber: 5 }] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => useUpdatePrs("a1"), { wrapper: localWrapper });
    await act(async () => {
      await result.current.mutateAsync({ repositoryIds: ["r1"] });
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/applications/a1/update-prs", { repositoryIds: ["r1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["assurance", "applications", "a1"] });
  });

  it("useCreateException posts to /mesh/exceptions and parses the created exception", async () => {
    postMock.mockResolvedValueOnce({
      id: "exc-1",
      repository_id: "r1",
      rule: "Red recon",
      reason: "Batch job",
      approved_by: "profile-1",
      expires_at: "2027-01-01T00:00:00Z",
      created_at: "2026-09-28T00:00:00Z",
    });

    const { result } = renderHook(() => useCreateException("a1"), { wrapper });
    let created;
    await act(async () => {
      created = await result.current.mutateAsync({ repositoryId: "r1", rule: "Red recon", reason: "Batch job", expiresAt: "2027-01-01" });
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/mesh/exceptions", {
      repositoryId: "r1",
      rule: "Red recon",
      reason: "Batch job",
      expiresAt: "2027-01-01",
    });
    expect((created as { rule: string }).rule).toBe("Red recon");
  });
});
