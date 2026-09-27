import { Navigate, generatePath, useParams } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

/**
 * Legacy redirects (T033). See contracts/routes.md §1 and §"Share tokens":
 * "legacy `/project/:id/<page>/t/:token` -> new `/p/:id/<route>?t=:token`.
 * The existing `useShareToken` hook keeps working. The router only
 * rewrites the URL form."
 *
 * `useShareToken` (src/hooks/useShareToken.ts) reads the token from the
 * `token` query param (or a `:token` path param), not `t`. Since this
 * contract explicitly renames the query param to `t`, `useShareToken` was
 * given a matching `t` fallback (a minimal, additive change — see that
 * file) so a redirected link still authenticates. This is the one
 * documented contract ambiguity in this work package: the contract's
 * prose says the hook "keeps working" as-is, but its query-param name
 * didn't match the new URL form it was asked to keep working with.
 */
function LegacyRedirect({ to }: { to: string }) {
  const params = useParams();
  return <Navigate to={generatePath(to, params)} replace />;
}

function LegacyTokenRedirect({ to }: { to: string }) {
  const params = useParams<Record<string, string | undefined>>();
  const { token, ...rest } = params;
  const target = generatePath(to, rest);
  return <Navigate to={token ? `${target}?t=${encodeURIComponent(token)}` : target} replace />;
}

interface SimpleRedirect {
  from: string;
  to: string;
}

/** Top-level legacy paths that moved under /library or were renamed. */
export const SIMPLE_REDIRECTS: SimpleRedirect[] = [
  { from: "/dashboard", to: "/projects" },
  { from: "/gallery", to: "/library/gallery" },
  { from: "/standards", to: "/library/standards" },
  { from: "/tech-stacks", to: "/library/tech-stacks" },
  { from: "/build-books", to: "/library/build-books" },
  { from: "/build-books/new", to: "/library/build-books/new" },
  { from: "/build-books/:id", to: "/library/build-books/:id" },
  { from: "/build-books/:id/edit", to: "/library/build-books/:id/edit" },
];

interface ProjectPageRedirect {
  /** The page segment under legacy `/project/:projectId/<legacy>`. */
  legacy: string;
  /** The new path template, e.g. `/p/:projectId/v/current/define/requirements`. */
  to: string;
}

/** Every `/project/:id/<page>` -> new-URL mapping from contracts/routes.md §1. */
export const PROJECT_PAGE_REDIRECTS: ProjectPageRedirect[] = [
  { legacy: "settings", to: "/p/:projectId/settings" },
  { legacy: "requirements", to: "/p/:projectId/v/current/define/requirements" },
  { legacy: "standards", to: "/p/:projectId/v/current/define/standards" },
  { legacy: "artifacts", to: "/p/:projectId/v/current/define/artifacts" },
  { legacy: "chat", to: "/p/:projectId/v/current/define/chat" },
  { legacy: "canvas", to: "/p/:projectId/v/current/design/canvas" },
  { legacy: "specifications", to: "/p/:projectId/v/current/design/specifications" },
  { legacy: "build", to: "/p/:projectId/v/current/build/agent" },
  { legacy: "repository", to: "/p/:projectId/v/current/build/repository" },
  { legacy: "database", to: "/p/:projectId/v/current/build/database" },
  { legacy: "deploy", to: "/p/:projectId/v/current/ship/environments" },
  { legacy: "audit", to: "/p/:projectId/v/current/ship/audit" },
  { legacy: "present", to: "/p/:projectId/v/current/ship/present" },
];

/** Builds the full set of legacy-redirect `RouteObject`s, including the `/t/:token` variants. */
export function buildLegacyRedirectRoutes(): RouteObject[] {
  const routes: RouteObject[] = SIMPLE_REDIRECTS.map(({ from, to }) => ({
    path: from,
    element: <LegacyRedirect to={to} />,
  }));

  for (const { legacy, to } of PROJECT_PAGE_REDIRECTS) {
    routes.push({ path: `/project/:projectId/${legacy}`, element: <LegacyRedirect to={to} /> });
    routes.push({ path: `/project/:projectId/${legacy}/t/:token`, element: <LegacyTokenRedirect to={to} /> });
  }

  return routes;
}
