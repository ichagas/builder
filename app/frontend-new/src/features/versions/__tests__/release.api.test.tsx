import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useFirstRelease, useReleaseChecks, useReleaseVersion } from "../release.api";

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...a: unknown[]) => getMock(...a), post: (...a: unknown[]) => postMock(...a) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const VERSION_ROW = {
  id: "ver1",
  project_id: "p1",
  name: "v1.1.0",
  kind: "released",
  is_current: true,
  is_first_release: false,
  released_at: "2026-09-01T00:00:00Z",
  released_by: null,
  release_notes: "- New: x",
  git_tag: "v1.1.0",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  deployTriggered: false,
  deployReason: "no-deployment-configured",
};

describe("release api", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it("fetches checks with versionId and share token", async () => {
    getMock.mockResolvedValue({ projectId: "p1", checks: [{ id: "a", label: "A", passed: true }], canRelease: true });
    const { result } = renderHook(() => useReleaseChecks("p1", "ver1", "tok"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/projects/p1/release-checks?versionId=ver1&token=tok");
    expect(result.current.data?.canRelease).toBe(true);
  });

  it("omits versionId for the first release and skips when disabled", async () => {
    getMock.mockResolvedValue({ projectId: "p1", checks: [], canRelease: false });
    const { result } = renderHook(() => useReleaseChecks("p1", undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/projects/p1/release-checks");
    getMock.mockClear();
    renderHook(() => useReleaseChecks("p1", "ver1", null, false), { wrapper });
    expect(getMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed checks response", async () => {
    getMock.mockResolvedValue({ nope: true });
    const { result } = renderHook(() => useReleaseChecks("p1", "ver1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("posts a release and parses carry-over ids", async () => {
    postMock.mockResolvedValue({ version: VERSION_ROW, carriedOverWorkItemIds: ["w1"] });
    const { result } = renderHook(() => useReleaseVersion("p1"), { wrapper });
    const res = await result.current.mutateAsync({ versionId: "ver1" });
    expect(postMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions/ver1/release", {});
    expect(res.carriedOverWorkItemIds).toEqual(["w1"]);
  });

  it("posts the first release", async () => {
    postMock.mockResolvedValue({ version: { ...VERSION_ROW, name: "v1.0.0", is_first_release: true }, project: { id: "p1", stage: "released" } });
    const { result } = renderHook(() => useFirstRelease("p1"), { wrapper });
    const res = await result.current.mutateAsync();
    expect(postMock).toHaveBeenCalledWith("/api/v1/projects/p1/first-release", {});
    expect(res.version.is_first_release).toBe(true);
  });
});
