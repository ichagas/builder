import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { __resetLongTasksForTests, cancelLongTask, settleLongTask, startLongTask, useLongTask, STALE_RUNNING_MS } from "../useLongTask";

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

  describe("stale running tasks", () => {
    it("marks a running task failed after the TTL with no update, then prunes it", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useLongTask());
      act(() => {
        result.current.start({ id: "stuck-1", label: "Stuck" });
      });
      act(() => {
        vi.advanceTimersByTime(STALE_RUNNING_MS - 1);
      });
      expect(result.current.runningCount).toBe(1);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.runningCount).toBe(0);
      expect(result.current.tasks.find((t) => t.id === "stuck-1")?.status).toBe("failed");
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });
      expect(result.current.tasks).toEqual([]);
    });

    it("update() resets the TTL", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useLongTask());
      let handle!: ReturnType<typeof result.current.start>;
      act(() => {
        handle = result.current.start({ id: "live-1", label: "Live" });
      });
      act(() => {
        vi.advanceTimersByTime(STALE_RUNNING_MS - 1000);
      });
      act(() => handle.update(50));
      act(() => {
        vi.advanceTimersByTime(STALE_RUNNING_MS - 1000);
      });
      expect(result.current.tasks.find((t) => t.id === "live-1")?.status).toBe("running");
    });

    it("done() cancels the stale timer, and a restarted task is not pruned by an old timer", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useLongTask());
      let handle!: ReturnType<typeof result.current.start>;
      act(() => {
        handle = result.current.start({ id: "r-1", label: "Run" });
      });
      act(() => handle.done());
      act(() => {
        vi.advanceTimersByTime(STALE_RUNNING_MS - 1000);
      });
      // Restart the same id shortly before the old retention timer fires.
      act(() => {
        result.current.start({ id: "r-1", label: "Run again" });
      });
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });
      expect(result.current.tasks.find((t) => t.id === "r-1")?.status).toBe("running");
    });
  });

  it("an old removal timer cannot prune a restarted task that finished again", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLongTask());
    act(() => result.current.start({ id: "run-1", label: "First" }).done());
    act(() => vi.advanceTimersByTime(4 * 60 * 1000));
    let handle!: ReturnType<typeof result.current.start>;
    act(() => {
      handle = result.current.start({ id: "run-1", label: "Second" });
    });
    act(() => handle.done());
    // The first run's 5 minute window ends here; the second run's has 4 minutes left.
    act(() => vi.advanceTimersByTime(60 * 1000 + 1000));
    expect(result.current.tasks.find((t) => t.id === "run-1")).toMatchObject({ label: "Second", status: "done" });
    act(() => vi.advanceTimersByTime(5 * 60 * 1000));
    expect(result.current.tasks.find((t) => t.id === "run-1")).toBeUndefined();
  });

  it("__resetLongTasksForTests clears pending removal timers", () => {
    vi.useFakeTimers();
    act(() => {
      startLongTask({ id: "r", label: "x" }).done();
    });
    act(() => __resetLongTasksForTests());
    expect(vi.getTimerCount()).toBe(0);
  });
});
