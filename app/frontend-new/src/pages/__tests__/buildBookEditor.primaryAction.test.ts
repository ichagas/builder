import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  usePublishBuildBookEditorPrimaryAction,
  useBuildBookEditorPrimaryAction,
} from "../buildBookEditor.primaryAction";

// Reset the shared store between tests (module-level singleton), the same
// way BuildBookEditor.tsx does on unmount.
afterEach(() => {
  const { unmount } = renderHook(() => usePublishBuildBookEditorPrimaryAction(undefined));
  unmount();
});

describe("buildBookEditor.primaryAction (T062, WP-L3)", () => {
  it("starts with no published action", () => {
    const { result } = renderHook(() => useBuildBookEditorPrimaryAction());
    expect(result.current).toBeUndefined();
  });

  it("publishes 'Create' while creating a new build book and the header hook reads it back", () => {
    const onClick = () => {};
    renderHook(() => usePublishBuildBookEditorPrimaryAction({ label: "Create", onClick }));
    const reader = renderHook(() => useBuildBookEditorPrimaryAction());
    expect(reader.result.current?.label).toBe("Create");
  });

  it("publishes 'Save', disabled while isSaving, while editing an existing build book", () => {
    const onClick = () => {};
    const publisher = renderHook(
      ({ isSaving }: { isSaving: boolean }) =>
        usePublishBuildBookEditorPrimaryAction({ label: "Save", onClick, disabled: isSaving }),
      { initialProps: { isSaving: false } }
    );
    const reader = renderHook(() => useBuildBookEditorPrimaryAction());
    expect(reader.result.current?.label).toBe("Save");
    expect(reader.result.current?.disabled).toBe(false);

    act(() => publisher.rerender({ isSaving: true }));
    reader.rerender();
    expect(reader.result.current?.disabled).toBe(true);
  });

  it("clears to undefined when the page unmounts or re-publishes undefined (non-admin branch)", () => {
    const publisher = renderHook(() =>
      usePublishBuildBookEditorPrimaryAction({ label: "Save", onClick: () => {} })
    );
    const reader = renderHook(() => useBuildBookEditorPrimaryAction());
    expect(reader.result.current?.label).toBe("Save");

    publisher.unmount();
    reader.rerender();
    expect(reader.result.current).toBeUndefined();
  });
});
