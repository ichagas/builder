import * as React from "react";
import type { ActionSpec } from "@/components/shell/types";

/**
 * createPrimaryActionStore (T027, WP-F3b). Factory for the tiny external
 * store a restyled page uses to hand a *live* primary action to the route
 * registry's `usePrimaryAction` hook (`app/routes/types.ts`,
 * `UsePrimaryAction`), which `PageHeader`/`PrimaryActionSlot` call from
 * their own render, outside the page's subtree.
 *
 * `UsePrimaryAction` is a plain no-arg hook, so a page can't hand it
 * per-render values (e.g. a mutation's `disabled`/`pending` state) as an
 * argument, and the route registry can't call the page's own data hooks a
 * second time without duplicating fetches/opening a second realtime
 * channel. Instead the page publishes its current `ActionSpec` into a
 * module-level store on every render (via `usePublishPrimaryAction`) and a
 * tiny hook next to the route entry reads it back (via `usePrimaryAction`),
 * built on `useSyncExternalStore` so the *page's render* stays the source
 * of truth instead of new React state living above both.
 *
 * This is the same shape `PrimaryActionContext.tsx` uses in the opposite
 * direction (`PageHeader` -> `PrimaryActionSlot`) and the pattern D1
 * (`pages/project/requirements.primaryAction.ts`) hand-rolled first --
 * pulled out here so every page that needs one doesn't reinvent it.
 *
 * Call the factory once per page, at module scope, and export the two
 * hooks it returns:
 *
 * ```ts
 * const { usePublishPrimaryAction, usePrimaryAction } = createPrimaryActionStore();
 *
 * // In the page component, on every render:
 * usePublishPrimaryAction(canAdd ? { label: "Add epic", onClick: addEpic } : undefined);
 *
 * // Referenced from the route registry (app/routes/project.tsx):
 * export { usePrimaryAction as useRequirementsPrimaryAction };
 * ```
 *
 * A module-level singleton is safe here because only one instance of a
 * given routed page is ever mounted at a time -- but that also means a
 * store must never leak a stale action past its publisher's lifetime:
 * `usePublishPrimaryAction` clears the store on unmount, so navigating away
 * (or swapping to a different project's copy of the same page) always
 * starts the next mount from `undefined` rather than showing the previous
 * page's/project's action for one frame.
 *
 * Publishing runs in a post-render effect (so the action always closes over
 * the page's latest state) but only notifies subscribers when the published
 * value actually differs (shallow field comparison) from the last one --
 * otherwise a page that re-renders often (e.g. on every keystroke) would
 * notify on every render even though nothing the header shows changed,
 * which risks a render loop if a subscriber's re-render is itself part of
 * what triggers the page's next render.
 */
export interface PrimaryActionStore<T = ActionSpec> {
  /**
   * Publishes `action` for the lifetime of the calling component. Call this
   * unconditionally on every render of the page that owns the action --
   * pass `undefined` when the page currently has no primary action (e.g.
   * gated by role). Clears the store on unmount.
   */
  usePublishPrimaryAction(action: T | undefined): void;
  /** Reads the currently published action. Returns `undefined` if nothing has published yet, or after the publisher unmounts. */
  usePrimaryAction(): T | undefined;
}

function shallowEqual<T>(a: T | undefined, b: T | undefined): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const aKeys = Object.keys(a as object) as (keyof T)[];
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(a[key], (b as Record<keyof T, unknown>)[key]));
}

/** Creates one independent primary-action store. Call once per page, at module scope. */
export function createPrimaryActionStore<T = ActionSpec>(): PrimaryActionStore<T> {
  let current: T | undefined;
  const listeners = new Set<() => void>();

  function setAction(next: T | undefined) {
    if (shallowEqual(current, next)) return;
    current = next;
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getSnapshot(): T | undefined {
    return current;
  }

  function usePublishPrimaryAction(action: T | undefined): void {
    React.useEffect(() => {
      setAction(action);
    });
    React.useEffect(() => {
      return () => setAction(undefined);
    }, []);
  }

  function usePrimaryAction(): T | undefined {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  return { usePublishPrimaryAction, usePrimaryAction };
}

export default createPrimaryActionStore;
