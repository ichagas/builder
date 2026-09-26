import * as React from "react";
import type { CommandPaletteItem } from "./CommandPalette";

/**
 * CommandPaletteItemsContext (T036). Layouts publish the items they know
 * about (library/root nav from `RootLayout`, the current project's tools
 * from `ProjectLayout`) and `CommandPalette` (mounted once, at the router
 * root) merges everything currently published into one flat list.
 *
 * Same external-store shape as `PrimaryActionContext`, for the same reason:
 * a layout re-publishing a fresh items array on every render must not
 * re-render that layout's own subtree, or the publishing effect loops.
 */
function createItemsStore() {
  const byOwner = new Map<string, CommandPaletteItem[]>();
  let snapshot: CommandPaletteItem[] = [];
  const listeners = new Set<() => void>();

  function recompute() {
    snapshot = Array.from(byOwner.values()).flat();
  }

  return {
    getSnapshot: () => snapshot,
    setItems: (ownerId: string, items: CommandPaletteItem[]) => {
      if (items.length === 0) byOwner.delete(ownerId);
      else byOwner.set(ownerId, items);
      recompute();
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

type ItemsStore = ReturnType<typeof createItemsStore>;

const CommandPaletteItemsStoreContext = React.createContext<ItemsStore | undefined>(undefined);

export function CommandPaletteItemsProvider({ children }: { children: React.ReactNode }) {
  const storeRef = React.useRef<ItemsStore>();
  if (!storeRef.current) storeRef.current = createItemsStore();
  return <CommandPaletteItemsStoreContext.Provider value={storeRef.current}>{children}</CommandPaletteItemsStoreContext.Provider>;
}

const EMPTY: CommandPaletteItem[] = [];
const noopSubscribe = () => () => {};

/** Used by `CommandPalette` to read the currently published items. */
export function useCommandPaletteItems(): CommandPaletteItem[] {
  const store = React.useContext(CommandPaletteItemsStoreContext);
  return React.useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.getSnapshot() ?? EMPTY,
    () => store?.getSnapshot() ?? EMPTY,
  );
}

let ownerSeq = 0;

/** Used by a layout to publish its items for as long as it stays mounted. */
export function usePublishCommandPaletteItems(items: CommandPaletteItem[]) {
  const store = React.useContext(CommandPaletteItemsStoreContext);
  const ownerIdRef = React.useRef<string>();
  if (!ownerIdRef.current) ownerIdRef.current = `owner-${++ownerSeq}`;

  React.useEffect(() => {
    store?.setItems(ownerIdRef.current!, items);
  });
  React.useEffect(() => {
    const ownerId = ownerIdRef.current!;
    return () => store?.setItems(ownerId, []);
  }, [store]);
}
