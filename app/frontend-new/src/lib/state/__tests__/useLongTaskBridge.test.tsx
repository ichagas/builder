import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { __resetLongTasksForTests, useLongTask } from "../useLongTask";
import { useLongTaskBridge, type LongTaskBridgeInput } from "../useLongTaskBridge";

afterEach(() => {
  act(() => __resetLongTasksForTests());
});

describe("useLongTaskBridge", () => {
  it("is a no-op with no id (e.g. rendered outside the shell, before a run starts)", () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    renderHook(() => useLongTaskBridge({ id: undefined, active: false, label: "Auditing" }));
    expect(tasksResult.current.tasks).toEqual([]);
  });

  it("is a no-op while active is false, even with an id", () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    renderHook(() => useLongTaskBridge({ id: "audit-1", active: false, label: "Auditing" }));
    expect(tasksResult.current.tasks).toEqual([]);
  });

  it("active:false → true starts a task with the given id and label", () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { rerender } = renderHook((props: LongTaskBridgeInput) => useLongTaskBridge(props), {
      initialProps: { id: "audit-1", active: false, label: "Running audit" },
    });
    rerender({ id: "audit-1", active: true, label: "Running audit" });
    expect(tasksResult.current.tasks).toHaveLength(1);
    expect(tasksResult.current.tasks[0]).toMatchObject({ id: "audit-1", label: "Running audit", status: "running" });
  });

  it("updates progress/label on the same id without re-adding a row", () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { rerender } = renderHook((props: LongTaskBridgeInput) => useLongTaskBridge(props), {
      initialProps: { id: "audit-1", active: true, label: "Running audit", progress: 10 } as LongTaskBridgeInput,
    });
    rerender({ id: "audit-1", active: true, label: "Running audit", progress: 55 });
    expect(tasksResult.current.tasks).toHaveLength(1);
    expect(tasksResult.current.tasks[0].progress).toBe(55);
  });

  it("active:true → false finishes as done() by default", () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { rerender } = renderHook((props: LongTaskBridgeInput) => useLongTaskBridge(props), {
      initialProps: { id: "deploy-1", active: true, label: "Deploying api" } as LongTaskBridgeInput,
    });
    rerender({ id: "deploy-1", active: false, label: "Deploying api" });
    expect(tasksResult.current.runningCount).toBe(0);
    expect(tasksResult.current.tasks.find((t) => t.id === "deploy-1")?.status).toBe("done");
  });

  it("active:true → false with failed:true finishes as fail()", () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { rerender } = renderHook((props: LongTaskBridgeInput) => useLongTaskBridge(props), {
      initialProps: { id: "audit-2", active: true, label: "Running audit" } as LongTaskBridgeInput,
    });
    rerender({ id: "audit-2", active: false, label: "Running audit", failed: true });
    expect(tasksResult.current.failedCount).toBe(1);
  });

  it("dedupes by id: two bridge instances for the same run show one row", () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    renderHook(() => useLongTaskBridge({ id: "agent-coding-s1", active: true, label: "Running build agent" }));
    renderHook(() => useLongTaskBridge({ id: "agent-coding-s1", active: true, label: "Running build agent" }));
    expect(tasksResult.current.tasks.filter((t) => t.id === "agent-coding-s1")).toHaveLength(1);
  });

  it("unmounting a still-active bridge does not mark the run done/failed", () => {
    const { result: tasksResult } = renderHook(() => useLongTask());
    const { unmount } = renderHook(() => useLongTaskBridge({ id: "audit-3", active: true, label: "Running audit" }));
    expect(tasksResult.current.tasks.find((t) => t.id === "audit-3")?.status).toBe("running");
    unmount();
    expect(tasksResult.current.tasks.find((t) => t.id === "audit-3")?.status).toBe("running");
  });
});
