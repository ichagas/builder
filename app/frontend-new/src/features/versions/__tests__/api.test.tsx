import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useVersions, useWorkItems, useCreateVersion, useUpdateWorkItem } from "../api";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const VERSION = {
  id: "v1",
  project_id: "p1",
  name: "v1.0.0",
  kind: "released",
  is_current: true,
  is_first_release: true,
  released_at: "2026-08-01T00:00:00Z",
  released_by: null,
  release_notes: null,
  git_tag: "v1.0.0",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  work_item_count: "3",
  active_work_item_count: "1",
};

const WORK_ITEM = {
  id: "wi1",
  project_id: "p1",
  key: "WI-1",
  version_id: null,
  type: "bug",
  severity: "high",
  title: "Broken upload",
  source: "Help desk",
  evidence: null,
  status: "triage",
  phase_state: { define: "todo", design: "todo", build: "todo", ship: "todo" },
  phase_notes: {},
  branch: null,
  preview_url: null,
  bug_report: null,
  components: [],
  agent_session_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

describe("versions api", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
  });

  it("useVersions parses GET /projects/:id/versions and coerces string counts", async () => {
    getMock.mockResolvedValueOnce([VERSION]);
    const { result } = renderHook(() => useVersions("p1", null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions");
    expect(result.current.data?.[0].work_item_count).toBe(3);
    expect(result.current.data?.[0].active_work_item_count).toBe(1);
  });

  it("useVersions appends ?token= for share-token access", async () => {
    getMock.mockResolvedValueOnce([]);
    renderHook(() => useVersions("p1", "share-tok"), { wrapper });
    await waitFor(() => expect(getMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions?token=share-tok"));
  });

  it("useVersions stays disabled without a projectId", () => {
    const { result } = renderHook(() => useVersions(undefined, null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useWorkItems parses GET /projects/:id/work-items and forwards status/versionId", async () => {
    getMock.mockResolvedValueOnce([WORK_ITEM]);
    const { result } = renderHook(() => useWorkItems("p1", { status: "triage" }, null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/projects/p1/work-items?status=triage");
    expect(result.current.data).toEqual([WORK_ITEM]);
  });

  it("useCreateVersion POSTs and invalidates the versions list", async () => {
    postMock.mockResolvedValueOnce({ ...VERSION, id: "v2", name: "v1.0.1", kind: "hotfix", is_current: false, work_item_count: "0", active_work_item_count: "0" });
    const { result } = renderHook(() => useCreateVersion("p1", null), { wrapper });
    result.current.mutate({ name: "v1.0.1", kind: "hotfix" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions", { name: "v1.0.1", kind: "hotfix" });
    expect(result.current.data?.id).toBe("v2");
  });

  it("useUpdateWorkItem PATCHes /work-items/:id with only the patch fields", async () => {
    patchMock.mockResolvedValueOnce({ ...WORK_ITEM, version_id: "v2" });
    const { result } = renderHook(() => useUpdateWorkItem("p1", null), { wrapper });
    result.current.mutate({ id: "wi1", versionId: "v2" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(patchMock).toHaveBeenCalledWith("/api/v1/work-items/wi1", { versionId: "v2" });
  });
});
