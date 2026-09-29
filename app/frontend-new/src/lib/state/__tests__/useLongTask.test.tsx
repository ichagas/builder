import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { __resetLongTasksForTests, cancelLongTask, settleLongTask, useLongTask } from "../useLongTask";

afterEach(() => {
  act(() => __resetLongTasksForTests());
  vi.useRealTimers();
});

describe("useLongTask", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useLongTask());
    expect(result.current.tasks).toEqual([]);
    expect(result.current.runningCount).toBe(0);
  });

  it("start() adds a running task, reflected in runningCount", () => {
    const { result } = renderHook(() => useLongTask());
    act(() => {
      result.current.start({ id: "agent-1", label: "Fixing WI-42" });
    });
    expect(result.current.runningCount).toBe(1);
    expect(result.current.tasks[0]).toMatchObject({ id: "agent-1", label: "Fixing WI-42", status: "running" });
  });

  it("the handle's update() changes progress and label", () => {
    const { result } = renderHook(() => useLongTask());
    let handle!: ReturnType<typeof result.current.start>;
    act(() => {
      handle = result.current.start({ id: "agent-2", label: "Auditing" });
    });
    act(() => handle.update(42));
    expect(result.current.tasks.find((t) => t.id === "agent-2")?.progress).toBe(42);
  });

  it("done()/fail() move the task out of the running count but keep it briefly for StatusCenter", () => {
    const { result } = renderHook(() => useLongTask());
    let handle!: ReturnType<typeof result.current.start>;
    act(() => {
      handle = result.current.start({ id: "deploy-1", label: "Deploying v1.5.0" });
    });
    act(() => handle.done());
    expect(result.current.runningCount).toBe(0);
    expect(result.current.tasks.find((t) => t.id === "deploy-1")?.status).toBe("done");

    let failHandle!: ReturnType<typeof result.current.start>;
    act(() => {
      failHandle = result.current.start({ id: "audit-1", label: "Auditing v1.5.0" });
    });
    act(() => failHandle.fail());
    expect(result.current.failedCount).toBe(1);
  });

  it("prunes finished tasks after the retention window", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLongTask());
    let handle!: ReturnType<typeof result.current.start>;
    act(() => {
      handle = result.current.start({ id: "sandbox-1", label: "Onboarding sandbox" });
    });
    act(() => handle.done());
    expect(result.current.tasks.some((t) => t.id === "sandbox-1")).toBe(true);
    act(() => vi.advanceTimersByTime(5 * 60 * 1000 + 1));
    expect(result.current.tasks.some((t) => t.id === "sandbox-1")).toBe(false);
  });

  it("settleLongTask settles only running tasks; cancelLongTask removes a task", () => {
    const { result } = renderHook(() => useLongTask());
    act(() => {
      result.current.start({ id: "a", label: "A" });
      result.current.start({ id: "b", label: "B" });
    });
    act(() => settleLongTask("a", "failed"));
    expect(result.current.tasks.find((t) => t.id === "a")?.status).toBe("failed");
    act(() => settleLongTask("a", "done"));
    expect(result.current.tasks.find((t) => t.id === "a")?.status).toBe("failed");
    act(() => settleLongTask("missing", "done"));
    expect(result.current.tasks).toHaveLength(2);
    act(() => cancelLongTask("b"));
    expect(result.current.tasks.map((t) => t.id)).toEqual(["a"]);
  });
});
