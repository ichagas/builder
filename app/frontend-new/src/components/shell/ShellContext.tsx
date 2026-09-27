import * as React from "react";

/**
 * ShellContext (T034). "Embedded mode (transitional): ShellContext with
 * embedded=true inside the new layouts. components/layout/{PrimaryNav,
 * ProjectSidebar, ProjectPageHeader} render null when embedded, so every
 * legacy page works in the shell from day one." (tasks.md T034,
 * contracts/design-system.md, plan.md M1 exit criterion.) Removed in T070
 * once every page has been moved onto the new shell (Phase 5 cutover) and
 * those three legacy components are deleted.
 */
export interface ShellContextValue {
  embedded: boolean;
}

const ShellContext = React.createContext<ShellContextValue>({ embedded: false });

export function ShellProvider({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ embedded }), [embedded]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  return React.useContext(ShellContext);
}

export default ShellContext;
