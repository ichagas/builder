import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCreatePresentationDialogOpen, usePresentPrimaryAction } from "../present.primaryAction";

// Reset the shared store between tests, the same way Present.tsx does on
// unmount (see present.primaryAction.ts), since it's a module-level
// singleton.
afterEach(() => {
  const { result } = renderHook(() => useCreatePresentationDialogOpen());
  act(() => result.current[1](false));
});

describe("present.primaryAction (T053, WP-S3)", () => {
  it("usePresentPrimaryAction returns a 'New Presentation' action", () => {
    const { result } = renderHook(() => usePresentPrimaryAction());
    expect(result.current?.label).toBe("New Presentation");
    expect(result.current?.disabled).toBeUndefined();
  });

  it("clicking the primary action's onClick opens the dialog store", () => {
    const action = renderHook(() => usePresentPrimaryAction());
    const dialog = renderHook(() => useCreatePresentationDialogOpen());
    expect(dialog.result.current[0]).toBe(false);

    act(() => action.result.current?.onClick?.());

    // Re-render to observe the store update (useSyncExternalStore notifies
    // subscribers, which testing-library's act() flushes).
    dialog.rerender();
    expect(dialog.result.current[0]).toBe(true);
  });

  it("useCreatePresentationDialogOpen's setter is shared across every subscriber (PageHeader publishes, Present consumes)", () => {
    const a = renderHook(() => useCreatePresentationDialogOpen());
    const b = renderHook(() => useCreatePresentationDialogOpen());

    act(() => a.result.current[1](true));
    b.rerender();
    expect(b.result.current[0]).toBe(true);

    act(() => b.result.current[1](false));
    a.rerender();
    expect(a.result.current[0]).toBe(false);
  });
});
