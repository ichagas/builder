import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useWorkItem, useRequirementChanges, useCompleteStep, useUnskipDesign, useAddRequirementChange, useVersionChecks } from "../change.api";

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...a: unknown[]) => getMock(...a), post: (...a: unknown[]) => postMock(...a), patch: vi.fn() },
}));
vi.mock("@/integrations/pronghorn-api/client", () => ({ pronghornApi: { rpc: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const ITEM = {
  id: "wi1",
  project_id: "p1",
  key: "WI-1",
  version_id: "v2",
  type: "bug",
  severity: "high",
  title: "Broken upload",
  source: null,
  evidence: null,
  status: "active",
  phase_state: { define: "active", design: "skipped", build: "todo", ship: "todo" },
  phase_notes: {},
  branch: "fix/wi-1-broken-upload",
  preview_url: null,
  bug_report: { steps: ["Open"], expected: "ok", actual: "bad" },
  components: ["n1"],
  agent_session_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

describe("change.api (NV-03)", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it("fetches one change and appends the share token", async () => {
    getMock.mockResolvedValue(ITEM);
    const { result } = renderHook(() => useWorkItem("p1", "wi1", "tok"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/work-items/wi1?token=tok");
    expect(result.current.data?.branch).toBe("fix/wi-1-broken-upload");
  });

  it("rejects a malformed change", async () => {
    getMock.mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useWorkItem("p1", "wi1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("lists requirement deltas", async () => {
    getMock.mockResolvedValue([
      { id: "d1", work_item_id: "wi1", requirement_id: null, kind: "new", title: "Retry uploads", criterion: "Retries 3 times", created_at: "x", updated_at: "x" },
    ]);
    const { result } = renderHook(() => useRequirementChanges("p1", "wi1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/work-items/wi1/requirement-changes");
    expect(result.current.data?.[0].kind).toBe("new");
  });

  it("completes a step and unskips design through the step endpoints", async () => {
    postMock.mockResolvedValue(ITEM);
    const complete = renderHook(() => useCompleteStep("p1", "wi1"), { wrapper });
    await complete.result.current.mutateAsync("define");
    expect(postMock).toHaveBeenCalledWith("/api/v1/work-items/wi1/steps/define/complete", {});

    const unskip = renderHook(() => useUnskipDesign("p1", "wi1"), { wrapper });
    await unskip.result.current.mutateAsync();
    expect(postMock).toHaveBeenCalledWith("/api/v1/work-items/wi1/steps/design/unskip", {});
  });

  it("posts a requirement delta", async () => {
    postMock.mockResolvedValue({ id: "d1", work_item_id: "wi1", requirement_id: null, kind: "changed", title: "T", criterion: null, created_at: "x", updated_at: "x" });
    const { result } = renderHook(() => useAddRequirementChange("p1", "wi1"), { wrapper });
    await result.current.mutateAsync({ kind: "changed", title: "T", requirementId: "r1" });
    expect(postMock).toHaveBeenCalledWith("/api/v1/work-items/wi1/requirement-changes", { kind: "changed", title: "T", requirementId: "r1" });
  });

  it("reads the version's release checks", async () => {
    getMock.mockResolvedValue({ projectId: "p1", checks: [{ id: "c", label: "Tests", passed: true }], canRelease: true });
    const { result } = renderHook(() => useVersionChecks("p1", "v2"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/projects/p1/release-checks?versionId=v2");
  });
});
