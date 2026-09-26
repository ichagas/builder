import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { dismissUndo, useUndo } from "../useUndo";

afterEach(() => {
  dismissUndo();
  vi.useRealTimers();
});

describe("useUndo", () => {
  it("starts with nothing pending", () => {
    const { result } = renderHook(() => useUndo());
    expect(result.current.current).toBeUndefined();
  });

  it("push sets the current entry and trigger runs it then clears it", () => {
    const onUndo = vi.fn();
    const { result } = renderHook(() => useUndo());
    act(() => result.current.push({ text: "Archived WI-42", undo: onUndo }));
    expect(result.current.current?.text).toBe("Archived WI-42");
    act(() => result.current.trigger());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(result.current.current).toBeUndefined();
  });

  it("auto-dismisses after 7s", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndo());
    act(() => result.current.push({ text: "Deleted project", undo: vi.fn() }));
    expect(result.current.current).toBeDefined();
    act(() => vi.advanceTimersByTime(7000));
    expect(result.current.current).toBeUndefined();
  });

  it("only ever holds one entry at a time", () => {
    const { result } = renderHook(() => useUndo());
    act(() => result.current.push({ text: "First", undo: vi.fn() }));
    act(() => result.current.push({ text: "Second", undo: vi.fn() }));
    expect(result.current.current?.text).toBe("Second");
  });
});
