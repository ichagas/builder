import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { getBoolPref, setBoolPref, useBoolPref, useStringPref, useUiPrefs } from "../useUiPrefs";

afterEach(() => {
  window.localStorage.clear();
});

describe("useUiPrefs", () => {
  it("falls back to the default when nothing is stored", () => {
    expect(getBoolPref("rail.collapsed", false)).toBe(false);
    expect(getBoolPref("rail.collapsed", true)).toBe(true);
  });

  it("persists a boolean pref across reads", () => {
    setBoolPref("rail.collapsed", true);
    expect(getBoolPref("rail.collapsed", false)).toBe(true);
  });

  it("useBoolPref reads, writes and updates state", () => {
    const { result } = renderHook(() => useBoolPref("open.disclosure-1", false));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(getBoolPref("open.disclosure-1", false)).toBe(true);
  });

  it("useStringPref reads and writes group assignment", () => {
    const { result } = renderHook(() => useStringPref("group.app-1", ""));
    act(() => result.current[1]("frontend"));
    expect(result.current[0]).toBe("frontend");
  });

  it("never throws when localStorage access is blocked", () => {
    const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => getBoolPref("rail.collapsed", false)).not.toThrow();
    expect(getBoolPref("rail.collapsed", false)).toBe(false);
    spy.mockRestore();
  });

  it("useUiPrefs exposes disclosure/app helpers", () => {
    const { result } = renderHook(() => useUiPrefs());
    act(() => result.current.setDisclosureOpen("notes", true));
    expect(result.current.isDisclosureOpen("notes")).toBe(true);
    act(() => result.current.setAppGroup("app-2", "backend"));
    expect(result.current.getAppGroup("app-2")).toBe("backend");
  });
});
