import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuditPipeline } from "../useAuditPipeline";
import { __resetLongTasksForTests, useLongTask } from "@/lib/state/useLongTask";

/**
 * T035 (WP-F5): useAuditPipeline bridges its own isRunning/progress state
 * into useLongTask, with no page changes — see the "T035 (WP-F5)" comment
 * near the end of useAuditPipeline.ts.
 *
 * The pipeline itself talks to several edge functions via `fetch`
 * (audit-extract-concepts, …). Exercising the full happy path isn't
 * relevant to this test — the bridge only cares about the isRunning /
 * progress.phase / error transitions the hook already exposes — so `fetch`
 * is mocked to fail fast: the first batch's `audit-extract-concepts` call
 * rejects, which the pipeline's own catch block turns into
 * `progress.phase: "error"` and `isRunning: false`. That's enough to
 * observe the bridge's start → fail cycle without stubbing SSE.
 */

vi.mock("@/lib/apiClient", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-token"),
}));

/** Rejects after a real (short) delay, so the "running" state is
 * observable via `waitFor` before the pipeline's catch block fires. */
function delayedRejectFetch(delayMs = 30) {
  return vi.fn().mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error("network down")), delayMs);
      }),
  );
}

beforeEach(() => {
  act(() => __resetLongTasksForTests());
  vi.stubGlobal("fetch", delayedRejectFetch());
});

afterEach(() => {
  act(() => __resetLongTasksForTests());
  vi.unstubAllGlobals();
});

describe("useAuditPipeline long-task bridge", () => {
  it("registers a running long task, keyed by session id, once the pipeline starts", async () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { result: pipelineResult } = renderHook(() => useAuditPipeline());

    act(() => {
      void pipelineResult.current.runPipeline({
        sessionId: "sess-1",
        projectId: "proj-1",
        shareToken: "",
        d1Elements: [],
        d2Elements: [],
      });
    });

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "audit-sess-1")).toBeDefined();
    });
    expect(tasksResult.current.tasks.find((t) => t.id === "audit-sess-1")).toMatchObject({
      status: "running",
      href: "/p/proj-1/v/current/ship/audit",
    });
  });

  it("finishes as fail() when the pipeline errors", async () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { result: pipelineResult } = renderHook(() => useAuditPipeline());

    act(() => {
      void pipelineResult.current.runPipeline({
        sessionId: "sess-2",
        projectId: "proj-1",
        shareToken: "",
        d1Elements: [],
        d2Elements: [],
      });
    });

    // Observe the "running" registration first (the pipeline's fetch call
    // is still pending at this point — see delayedRejectFetch).
    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "audit-sess-2")?.status).toBe("running");
    });

    // Then the delayed fetch rejection resolves the pipeline as an error.
    await waitFor(() => {
      expect(pipelineResult.current.isRunning).toBe(false);
    });
    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "audit-sess-2")?.status).toBe("failed");
    });
  });

  it("unmounting mid-run does not mark the task done/failed", async () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { result: pipelineResult, unmount } = renderHook(() => useAuditPipeline());

    act(() => {
      void pipelineResult.current.runPipeline({
        sessionId: "sess-3",
        projectId: "proj-1",
        shareToken: "",
        d1Elements: [],
        d2Elements: [],
      });
    });

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "audit-sess-3")?.status).toBe("running");
    });
    unmount();
    expect(tasksResult.current.tasks.find((t) => t.id === "audit-sess-3")?.status).toBe("running");
  });
});
