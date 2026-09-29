import * as React from "react";
import type { Version } from "../api";

/**
 * What `VersionScope` tells the tool rendered inside it. Tools that can do
 * better than the wrapper's blanket disable (hide edit affordances, skip
 * mutations) read `readOnly` from here instead of doing their own routing.
 */
export interface VersionScopeValue {
  readOnly: boolean;
  version: Version | null;
}

export const VersionScopeContext = React.createContext<VersionScopeValue>({ readOnly: false, version: null });

export function useVersionScopeContext(): VersionScopeValue {
  return React.useContext(VersionScopeContext);
}
