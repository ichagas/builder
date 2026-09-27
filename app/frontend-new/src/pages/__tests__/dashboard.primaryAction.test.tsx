import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCreateProjectDialogOpen, useDashboardPrimaryAction } from "../dashboard.primaryAction";

// Reset the shared store between tests, the same way Dashboard.tsx does on
// unmount (see dashboard.primaryAction.ts), since it's a module-level
// singleton.
afterEach(() => {
  const { result } = renderHook(() => useCreateProjectDialogOpen());
  act(() => result.current[1](false));
});

describe("dashboard.primaryAction", () => {
  it("useDashboardPrimaryAction returns a 'Create New Project' action", () => {
    const { result } = renderHook(() => useDashboardPrimaryAction());
    expect(result.current?.label).toBe("Create New Project");
    expect(result.current?.disabled).toBeUndefined();
  });

  it("clicking the primary action's onClick opens the dialog store", () => {
    const action = renderHook(() => useDashboardPrimaryAction());
    const dialog = renderHook(() => useCreateProjectDialogOpen());
    expect(dialog.result.current[0]).toBe(false);

    act(() => action.result.current?.onClick?.());

    // Re-render to observe the store update (useSyncExternalStore notifies
    // subscribers, which testing-library's act() flushes).
    dialog.rerender();
    expect(dialog.result.current[0]).toBe(true);
  });

  it("useCreateProjectDialogOpen's setter is shared across every subscriber (PageHeader publishes, Dashboard consumes)", () => {
    const a = renderHook(() => useCreateProjectDialogOpen());
    const b = renderHook(() => useCreateProjectDialogOpen());

    act(() => a.result.current[1](true));
    b.rerender();
    expect(b.result.current[0]).toBe(true);

    act(() => b.result.current[1](false));
    a.rerender();
    expect(a.result.current[0]).toBe(false);
  });
});
