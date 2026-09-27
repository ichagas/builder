import { useCallback, useState } from "react";

/**
 * useUiPrefs (T032). See contracts/design-system.md §3:
 * "useUiPrefs() is a typed local-storage store with try/catch fallback.
 * Keys: rail.collapsed, open.<disclosure>, exp.<appId>, group.<appId>."
 *
 * Every read/write is wrapped in try/catch: in a private window, with
 * blocked site storage, or in SSR/test environments without `localStorage`,
 * prefs silently fall back to the given default instead of throwing.
 */
const PREFIX = "pronghorn.ui.";

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // ignore — per-viewer convenience only
  }
}

function safeRemoveItem(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

/** Boolean preference (e.g. `rail.collapsed`, `open.<id>`). */
export function getBoolPref(key: string, defaultValue = false): boolean {
  const raw = safeGetItem(key);
  if (raw === null) return defaultValue;
  return raw === "1" || raw === "true";
}

export function setBoolPref(key: string, value: boolean): void {
  safeSetItem(key, value ? "1" : "0");
}

/** String preference (e.g. `group.<appId>`). */
export function getStringPref(key: string, defaultValue = ""): string {
  const raw = safeGetItem(key);
  return raw === null ? defaultValue : raw;
}

export function setStringPref(key: string, value: string): void {
  if (value === "") {
    safeRemoveItem(key);
  } else {
    safeSetItem(key, value);
  }
}

/** Hook form of a single boolean pref, e.g. `useBoolPref("rail.collapsed")`. */
export function useBoolPref(key: string, defaultValue = false): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValueState] = useState<boolean>(() => getBoolPref(key, defaultValue));

  const setValue = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValueState((prev) => {
        const resolved = typeof next === "function" ? (next as (prev: boolean) => boolean)(prev) : next;
        setBoolPref(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, setValue];
}

/** Hook form of a single string pref, e.g. `useStringPref("group.app-1")`. */
export function useStringPref(key: string, defaultValue = ""): [string, (next: string | ((prev: string) => string)) => void] {
  const [value, setValueState] = useState<string>(() => getStringPref(key, defaultValue));

  const setValue = useCallback(
    (next: string | ((prev: string) => string)) => {
      setValueState((prev) => {
        const resolved = typeof next === "function" ? (next as (prev: string) => string)(prev) : next;
        setStringPref(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, setValue];
}

/**
 * Typed store surface. Prefer the specific hooks (`useBoolPref`,
 * `useStringPref`) inside components; `useUiPrefs()` gives the plain
 * get/set functions for use outside render (event handlers, other hooks).
 */
export function useUiPrefs() {
  return {
    getBool: getBoolPref,
    setBool: setBoolPref,
    getString: getStringPref,
    setString: setStringPref,
    railCollapsed: useBoolPref("rail.collapsed", false),
    isDisclosureOpen: (id: string, defaultOpen = false) => getBoolPref(`open.${id}`, defaultOpen),
    setDisclosureOpen: (id: string, open: boolean) => setBoolPref(`open.${id}`, open),
    isAppExpanded: (appId: string, defaultOpen = false) => getBoolPref(`exp.${appId}`, defaultOpen),
    setAppExpanded: (appId: string, open: boolean) => setBoolPref(`exp.${appId}`, open),
    getAppGroup: (appId: string, defaultGroup = "") => getStringPref(`group.${appId}`, defaultGroup),
    setAppGroup: (appId: string, group: string) => setStringPref(`group.${appId}`, group),
  };
}

export default useUiPrefs;
