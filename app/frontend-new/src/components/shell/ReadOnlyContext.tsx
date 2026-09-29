import * as React from "react";

/**
 * ReadOnlyContext. A page-subtree flag that says "this whole view is
 * read-only right now" (today: a released or still-resolving version, set by
 * `VersionScope`). It lives in the shell, not in a feature, so `PageHeader`
 * (which publishes the primary action that both the desktop header button
 * and the mobile `PrimaryActionSlot` render) can disable the action without
 * the shell importing feature code. `PageHeader` is rendered by the tool
 * itself, i.e. below `VersionScope`, so it always sees the provider; and
 * because it publishes the already-disabled spec, the mobile slot (a
 * sibling outside the page subtree) follows for free.
 */
export interface ReadOnlyValue {
  readOnly: boolean;
  /** Why actions are disabled (already translated); shown as the button's title. */
  reason?: string;
}

const ReadOnlyContext = React.createContext<ReadOnlyValue>({ readOnly: false });

export const ReadOnlyProvider = ReadOnlyContext.Provider;

export function useShellReadOnly(): ReadOnlyValue {
  return React.useContext(ReadOnlyContext);
}

export default ReadOnlyContext;
