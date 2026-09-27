import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInfiniteAgentOperations } from "../useInfiniteAgentOperations";
import { __resetLongTasksForTests, useLongTask } from "@/lib/state/useLongTask";

/**
 * T035 (WP-F5): useInfiniteAgentOperations bridges the owning agent
 * session's status into useLongTask, with no page changes — see the "T035
 * (WP-F5)" comment in useInfiniteAgentOperations.ts.
 */

const { mockRpc, mockChannelOn, mockChannelSubscribe } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockChannelOn: vi.fn(),
  mockChannelSubscribe: vi.fn(),
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
      };
      return chan;
    },
    removeChannel: vi.fn(),
  },
}));

function operation(overrides: Partial<{ id: string; session_id: string; status: string }>) {
  return {
    id: "op1",
    session_id: "s1",
    operation_type: "modify",
    file_path: "src/a.ts",
    status: "in_progress",
    details: null,
    error_message: null,
    created_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockRpc.mockReset();
  act(() => __resetLongTasksForTests());
});

afterEach(() => {
  act(() => __resetLongTasksForTests());
});

describe("useInfiniteAgentOperations long-task bridge", () => {
  it("registers a running long task for a session with an in-progress operation", async () => {
    mockRpc.mockResolvedValue({ data: [operation({ status: "in_progress" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());

    renderHook(() => useInfiniteAgentOperations("p1", null));

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "agent-coding-s1")).toBeDefined();
    });
    expect(tasksResult.current.tasks.find((t) => t.id === "agent-coding-s1")).toMatchObject({
      status: "running",
      href: "/p/p1/v/current/build/agent",
    });
  });

  it("uses the build/database route for the database agent type", async () => {
    mockRpc.mockResolvedValue({ data: [operation({ status: "pending" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());

    renderHook(() => useInfiniteAgentOperations("p1", null, "database"));

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "agent-database-s1")).toBeDefined();
    });
    expect(tasksResult.current.tasks.find((t) => t.id === "agent-database-s1")?.href).toBe(
      "/p/p1/v/current/build/database",
    );
  });

  it("finishes as done() once every operation in the session is completed", async () => {
    mockRpc.mockResolvedValueOnce({ data: [operation({ status: "in_progress" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { result: hookResult } = renderHook(() => useInfiniteAgentOperations("p1", null));

    await waitFor(() => expect(hookResult.current.operations).toHaveLength(1));
    expect(tasksResult.current.tasks.find((t) => t.id === "agent-coding-s1")?.status).toBe("running");

    mockRpc.mockResolvedValueOnce({ data: [operation({ status: "completed" })], error: null });
    await act(async () => {
      await hookResult.current.refetch();
    });

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "agent-coding-s1")?.status).toBe("done");
    });
  });

  it("finishes as fail() when an operation in the session errors", async () => {
    mockRpc.mockResolvedValueOnce({ data: [operation({ status: "in_progress" })], error: null });
    const { result: hookResult } = renderHook(() => useInfiniteAgentOperations("p1", null));
    const { result: tasksResult } = renderHook(() => useLongTask());
    await waitFor(() => expect(hookResult.current.operations).toHaveLength(1));

    mockRpc.mockResolvedValueOnce({ data: [operation({ status: "error" })], error: null });
    await act(async () => {
      await hookResult.current.refetch();
    });

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "agent-coding-s1")?.status).toBe("failed");
    });
  });

  it("dedupes: two mounted instances for the same project/session show one row", async () => {
    mockRpc.mockResolvedValue({ data: [operation({ status: "in_progress" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());

    renderHook(() => useInfiniteAgentOperations("p1", null));
    renderHook(() => useInfiniteAgentOperations("p1", null));

    await waitFor(() => {
      expect(tasksResult.current.tasks.filter((t) => t.id === "agent-coding-s1")).toHaveLength(1);
    });
  });

  it("unmounting while the session is still active does not mark it done/failed", async () => {
    mockRpc.mockResolvedValue({ data: [operation({ status: "in_progress" })], error: null });
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { unmount } = renderHook(() => useInfiniteAgentOperations("p1", null));

    await waitFor(() => {
      expect(tasksResult.current.tasks.find((t) => t.id === "agent-coding-s1")?.status).toBe("running");
    });
    unmount();
    expect(tasksResult.current.tasks.find((t) => t.id === "agent-coding-s1")?.status).toBe("running");
  });
});
