import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  usePublishBuildBookDetailPrimaryAction,
  useBuildBookDetailPrimaryAction,
} from "../buildBookDetail.primaryAction";

// Reset the shared store between tests (module-level singleton), the same
// way BuildBookDetail.tsx does on unmount.
afterEach(() => {
  const { unmount } = renderHook(() => usePublishBuildBookDetailPrimaryAction(undefined));
  unmount();
});

describe("buildBookDetail.primaryAction (T062, WP-L3)", () => {
  it("starts with no published action", () => {
    const { result } = renderHook(() => useBuildBookDetailPrimaryAction());
    expect(result.current).toBeUndefined();
  });

  it("publishes the page's current 'Edit' action and the header hook reads it back", () => {
    const action = { label: "Edit", onClick: () => {} };
    const publisher = renderHook(() => usePublishBuildBookDetailPrimaryAction(action));
    const reader = renderHook(() => useBuildBookDetailPrimaryAction());

    expect(reader.result.current?.label).toBe("Edit");

    publisher.unmount();
    reader.rerender();
    expect(reader.result.current).toBeUndefined();
  });

  it("clears to undefined when the page re-publishes undefined (e.g. loading/not-found branches, or a non-admin)", () => {
    const publisher = renderHook(
      ({ value }: { value: { label: string; onClick: () => void } | undefined }) =>
        usePublishBuildBookDetailPrimaryAction(value),
      { initialProps: { value: { label: "Edit", onClick: () => {} } } }
    );
    const reader = renderHook(() => useBuildBookDetailPrimaryAction());
    expect(reader.result.current?.label).toBe("Edit");

    act(() => publisher.rerender({ value: undefined }));
    reader.rerender();
    expect(reader.result.current).toBeUndefined();
  });
});
