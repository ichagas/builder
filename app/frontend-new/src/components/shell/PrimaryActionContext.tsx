import * as React from "react";
import type { ActionSpec } from "./types";

/**
 * PrimaryActionContext (T024/T027). `PageHeader` publishes the current
 * page's primary action here; `PrimaryActionSlot` (mounted once, inside
 * `AppShell`, mirrored at <=768px per contracts/design-system.md §2) reads
 * it. This lets the primary action live with the page's own render (so it
 * always reflects the page's latest disabled/pending state) while still
 * rendering into shell-owned chrome outside the routed `<Outlet/>`.
 *
 * Implemented as a tiny external store (subscribe/getSnapshot), not React
 * state on a provider ancestor of the page: publishing a fresh `ActionSpec`
 * object (as `PageHeader` does on every render, since its `onClick` closure
 * is typically inline) must never re-render the page itself, or the effect
 * that publishes it re-fires every render and the two updates loop forever.
 * Only `useCurrentPrimaryAction` (used by `PrimaryActionSlot`, a sibling
 * outside the page's subtree) subscribes to changes.
 */
interface PrimaryActionStore {
  getSnapshot: () => ActionSpec | undefined;
  setAction: (action: ActionSpec | undefined) => void;
  subscribe: (listener: () => void) => () => void;
}

function createPrimaryActionStore(): PrimaryActionStore {
  let action: ActionSpec | undefined;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => action,
    setAction: (next) => {
      action = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const PrimaryActionStoreContext = React.createContext<PrimaryActionStore | undefined>(undefined);

export function PrimaryActionProvider({ children }: { children: React.ReactNode }) {
  const storeRef = React.useRef<PrimaryActionStore>();
  if (!storeRef.current) storeRef.current = createPrimaryActionStore();
  return <PrimaryActionStoreContext.Provider value={storeRef.current}>{children}</PrimaryActionStoreContext.Provider>;
}

const noopSubscribe = () => () => {};

/** Used by `PrimaryActionSlot` to read the currently published action. */
export function useCurrentPrimaryAction(): ActionSpec | undefined {
  const store = React.useContext(PrimaryActionStoreContext);
  return React.useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.getSnapshot(),
    () => store?.getSnapshot(),
  );
}

/**
 * Used by `PageHeader` to publish its primary action for the lifetime of
 * the page. Runs after every render (so a page's latest `onClick` closure
 * is always the one that fires) and clears the action on unmount so a
 * stale action never lingers after navigating away.
 */
export function usePublishPrimaryAction(action: ActionSpec | undefined) {
  const store = React.useContext(PrimaryActionStoreContext);
  React.useEffect(() => {
    store?.setAction(action);
  });
  React.useEffect(() => {
    return () => store?.setAction(undefined);
  }, [store]);
}

export default PrimaryActionStoreContext;
