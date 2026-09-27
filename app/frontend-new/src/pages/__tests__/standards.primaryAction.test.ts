import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStandardsPrimaryAction, NEW_CATEGORY_NAME_INPUT_ID } from "../standards.primaryAction";

const useAdminMock = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => useAdminMock(),
}));

describe("useStandardsPrimaryAction (T060, WP-L1)", () => {
  beforeEach(() => {
    useAdminMock.mockReset();
    document.body.innerHTML = "";
  });

  it("returns no primary action for a non-admin, matching the inline 'Add category' control being hidden for them", () => {
    useAdminMock.mockReturnValue({ isAdmin: false });
    const { result } = renderHook(() => useStandardsPrimaryAction());
    expect(result.current).toBeUndefined();
  });

  it("returns a 'New category' action for an admin", () => {
    useAdminMock.mockReturnValue({ isAdmin: true });
    const { result } = renderHook(() => useStandardsPrimaryAction());
    expect(result.current?.label).toBe("New category");
    expect(typeof result.current?.onClick).toBe("function");
  });

  it("focuses and scrolls to the existing inline 'New category name' input on click, without opening a dialog", () => {
    useAdminMock.mockReturnValue({ isAdmin: true });
    const input = document.createElement("input");
    input.id = NEW_CATEGORY_NAME_INPUT_ID;
    document.body.appendChild(input);
    const focusSpy = vi.spyOn(input, "focus");
    const scrollSpy = vi.spyOn(input, "scrollIntoView").mockImplementation(() => {});

    const { result } = renderHook(() => useStandardsPrimaryAction());
    result.current?.onClick?.();

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("does nothing if the inline input isn't mounted (e.g. still loading)", () => {
    useAdminMock.mockReturnValue({ isAdmin: true });
    const { result } = renderHook(() => useStandardsPrimaryAction());
    expect(() => result.current?.onClick?.()).not.toThrow();
  });
});
