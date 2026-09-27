import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealtimeDeployments } from "../useRealtimeDeployments";
import { __resetLongTasksForTests, useLongTask } from "@/lib/state/useLongTask";

/**
 * T035 (WP-F5): useRealtimeDeployments bridges each deployment's own
 * status into useLongTask, with no page changes — see the "T035 (WP-F5)"
 * comment in useRealtimeDeployments.ts.
 */

const { mockRpc, mockChannelOn, mockChannelSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockChannelOn: vi.fn(),
  mockChannelSubscribe: vi.fn(),
  mockRemoveChannel: vi.fn(),
}));

vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    rpc: mockRpc,
    channel: () => {
      const chan = {
        on: (...args: unknown[]) => {
          mockChannelOn(...args);
          return chan;
        },
        subscribe: (...args: unknown[]) => {
          mockChannelSubscribe(...args);
          return chan;
        },
        send: vi.fn(),
      };
      return chan;
    },
    removeChannel: mockRemoveChannel,
  },
}));

function deployment(overrides: Partial<{ id: string; status: string; name: string }>) {
  return {
    id: "d1",
    name: "api",
    status: "pending",
    url: null,
    last_deployed_at: null,
    ...overrides,
  } as any;
}

beforeEach(() => {
  mockRpc.mockReset();
  act(() => __resetLongTasksForTests());
});

afterEach(() => {
  act(() => __resetLongTasksForTests());
});

describe("useRealtimeDeployments long-task bridge", () => {
  it("registers a running long task for a deployment in an active status", async () => {
    mockRpc.mockResolvedValue({ data: [deployment({ status: "deploying" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());

    renderHook(() => useRealtimeDeployments("p1", null));

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "deploy-d1")).toBeDefined();
    });
    expect(tasksResult.current.tasks.find((t) => t.id === "deploy-d1")).toMatchObject({
      status: "running",
      href: "/p/p1/v/current/ship/environments",
    });
  });

  it("finishes the task as done() once the deployment reaches running", async () => {
    mockRpc.mockResolvedValueOnce({ data: [deployment({ status: "deploying" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { result: hookResult, rerender } = renderHook(
      ({ projectId }: { projectId: string }) => useRealtimeDeployments(projectId, null),
      { initialProps: { projectId: "p1" } },
    );

    await waitFor(() => expect(hookResult.current.deployments).toHaveLength(1));
    expect(tasksResult.current.tasks.find((t) => t.id === "deploy-d1")?.status).toBe("running");

    mockRpc.mockResolvedValueOnce({ data: [deployment({ status: "running" })], error: null });
    await act(async () => {
      await hookResult.current.refresh();
    });
    rerender({ projectId: "p1" });

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "deploy-d1")?.status).toBe("done");
    });
  });

  it("finishes the task as fail() when the deployment fails", async () => {
    mockRpc.mockResolvedValueOnce({ data: [deployment({ status: "building" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { result: hookResult } = renderHook(() => useRealtimeDeployments("p1", null));

    await waitFor(() => expect(hookResult.current.deployments).toHaveLength(1));

    mockRpc.mockResolvedValueOnce({ data: [deployment({ status: "failed" })], error: null });
    await act(async () => {
      await hookResult.current.refresh();
    });

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "deploy-d1")?.status).toBe("failed");
    });
  });

  it("dedupes: two mounted instances for the same project show one row per deployment", async () => {
    mockRpc.mockResolvedValue({ data: [deployment({ status: "deploying" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());

    renderHook(() => useRealtimeDeployments("p1", null));
    renderHook(() => useRealtimeDeployments("p1", null));

    await waitFor(() => {
      expect(tasksResult.current.tasks.filter((t) => t.id === "deploy-d1")).toHaveLength(1);
    });
  });

  it("unmounting while a deployment is still active does not mark it done/failed", async () => {
    mockRpc.mockResolvedValue({ data: [deployment({ status: "deploying" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { unmount } = renderHook(() => useRealtimeDeployments("p1", null));

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "deploy-d1")?.status).toBe("running");
    });
    unmount();
    expect(tasksResult.current.tasks.find((t) => t.id === "deploy-d1")?.status).toBe("running");
  });

  it("does not register a task for a deployment that's already running (steady state)", async () => {
    mockRpc.mockResolvedValue({ data: [deployment({ status: "running" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());

    renderHook(() => useRealtimeDeployments("p1", null));

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(tasksResult.current.tasks.find((t) => t.id === "deploy-d1")).toBeUndefined();
  });
});
