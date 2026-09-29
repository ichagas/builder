import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  readBaselineCounts,
  readGeneratedFiles,
  readSandboxError,
  repositoryHasOutput,
  useOpenPullRequests,
  useStartOnboardingRun,
  useOnboardingOutput,
} from "../job.api";
import { onboardingKeys } from "../api";
import { makeRepo, makeRun } from "./fixtures";

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...a: unknown[]) => getMock(...a), post: (...a: unknown[]) => postMock(...a) },
}));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, wrapper };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

describe("jsonb readers", () => {
  it("reads baseline counts, defaulting bad values to 0", () => {
    expect(readBaselineCounts({ green: 2, yellow: "x", red: 1 })).toEqual({ green: 2, yellow: 0, red: 1, blue: 0 });
  });
  it("drops malformed manifest entries", () => {
    expect(readGeneratedFiles([{ path: "a.yml", content: "x" }, 5, { nope: 1 }])).toEqual([{ path: "a.yml", content: "x" }]);
  });
  it("reads the sandbox error", () => {
    expect(readSandboxError({ sandboxError: "clone failed" })).toBe("clone failed");
    expect(readSandboxError({ sandboxError: "" })).toBeNull();
  });
  it("only counts a repo with files and no error as openable", () => {
    expect(repositoryHasOutput(makeRepo())).toBe(true);
    expect(repositoryHasOutput(makeRepo({ review: { sandboxError: "boom" } }))).toBe(false);
    expect(repositoryHasOutput(makeRepo({ generated_manifest: [] }))).toBe(false);
    expect(repositoryHasOutput(makeRepo({ selected: false }))).toBe(false);
  });
});

describe("mutations and queries", () => {
  it("starts the run and caches the returned run", async () => {
    const { queryClient, wrapper } = setup();
    postMock.mockResolvedValueOnce(makeRun({ status: "running" }));
    const { result } = renderHook(() => useStartOnboardingRun(), { wrapper });
    await result.current.mutateAsync("run1");
    expect(postMock).toHaveBeenCalledWith("/api/v1/onboarding/runs/run1/start");
    expect(queryClient.getQueryData<{ status: string }>(onboardingKeys.run("run1"))?.status).toBe("running");
  });

  it("opens pull requests only with an explicit confirm", async () => {
    const { wrapper } = setup();
    postMock.mockResolvedValueOnce(makeRun({ status: "prs_open" }));
    const { result } = renderHook(() => useOpenPullRequests(), { wrapper });
    await result.current.mutateAsync("run1");
    expect(postMock).toHaveBeenCalledWith("/api/v1/onboarding/runs/run1/pull-requests", { confirm: true });
  });

  it("reads the output and surfaces a 409 as an error", async () => {
    const { wrapper } = setup();
    getMock.mockRejectedValueOnce({ statusCode: 409, message: "Output is not available" });
    const { result } = renderHook(() => useOnboardingOutput("run1", true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/onboarding/runs/run1/output");
  });
});
