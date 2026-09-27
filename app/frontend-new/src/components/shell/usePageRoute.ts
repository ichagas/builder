import * as React from "react";
import { UNSAFE_DataRouterStateContext as DataRouterStateContext } from "react-router-dom";
import type { RouteHandle } from "./types";

/**
 * usePageRoute (T027/T033). Reads the current route's metadata — phase,
 * tool, title, usePrimaryAction — off the matched route's `handle`, which
 * `app/router.tsx` sets to the route registry entry for that path
 * (`app/routes/{root,library,project}.tsx`). See plan.md "the move and
 * restyle recipe" step 2: a page declares its metadata once in the
 * registry, and `PageHeader` (and anything else that needs the current
 * page's title/primary action) reads it back through this hook instead of
 * duplicating it as JSX props.
 *
 * Reads the router's data-router context directly (the same state
 * `useMatches` is built on) rather than calling `useMatches()` itself,
 * because `useMatches` throws outside a data router
 * (`createBrowserRouter`/`createMemoryRouter` + `RouterProvider`) — callers
 * like `PageHeader` are also unit-tested without any router at all, where
 * this should simply return `undefined` instead of crashing the render.
 */
export function usePageRoute(): RouteHandle | undefined {
  const dataRouterState = React.useContext(DataRouterStateContext);
  if (!dataRouterState) return undefined;

  const { matches } = dataRouterState;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const handle = matches[i]?.route.handle as RouteHandle | undefined;
    if (handle && typeof handle === "object" && "title" in handle && "usePrimaryAction" in handle) {
      return handle;
    }
  }
  return undefined;
}

export default usePageRoute;
