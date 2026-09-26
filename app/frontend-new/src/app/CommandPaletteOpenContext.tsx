import * as React from "react";

/**
 * Trigger for the ⌘K palette (T036). A plain context is safe here (unlike
 * `PrimaryActionContext`/`CommandPaletteItemsContext`): the value is a
 * single stable callback (backed by a `useState` setter, whose identity
 * React guarantees not to change), not a fresh object republished every
 * render, so there is no re-render cascade to guard against.
 */
export const CommandPaletteOpenContext = React.createContext<() => void>(() => {});

export function useOpenCommandPalette(): () => void {
  return React.useContext(CommandPaletteOpenContext);
}
