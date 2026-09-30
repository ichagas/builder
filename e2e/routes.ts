/**
 * Logical page -> URL mapping for app/frontend-new (contracts/routes.md §1).
 *
 * Tests must never navigate via the sidebar/nav: always go through one of
 * these helpers, which return a path relative to BASE_URL. (The legacy
 * frontend was removed in T074; only the new URL shape remains.)
 */

/** Appends a share-token query segment (contracts/routes.md: ?t=:token). */
function withToken(path: string, token?: string): string {
  return token ? `${path}?t=${token}` : path;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * RegExp matching a plain (no dynamic segments) route helper's output,
 * anchored to the end of the URL -- for `toHaveURL` assertions after an
 * in-app navigation, so the assertion follows the same route lookup
 * as every other helper instead of hardcoding a path.
 */
export function urlPattern(path: string): RegExp {
  return new RegExp(`${escapeRegExp(path)}$`);
}


export const routes = {
  welcome: () => "/welcome",
  auth: () => "/auth",
  authCallback: () => "/auth/callback",
  githubCallback: () => "/github/callback",
  terms: () => "/terms",
  privacy: () => "/privacy",
  license: () => "/license",

  projectsHome: () => "/projects",
  gallery: () => "/library/gallery",
  standardsLibrary: () => "/library/standards",
  techStacks: () => "/library/tech-stacks",
  buildBooks: () => "/library/build-books",
  buildBookNew: () => "/library/build-books/new",
  buildBookDetail: (id: string) => `/library/build-books/${id}`,
  buildBookEdit: (id: string) => `/library/build-books/${id}/edit`,
  settingsProfile: () => "/settings/profile",
  settingsOrganization: () => "/settings/organization",
  adminIntegrations: () => "/admin/integrations",

  project: {
    settings: (id: string, token?: string) =>
      withToken(`/p/${id}/settings`, token),
    /**
     * Matches `project.settings(<any id>, <any token>)`'s shape, for a
     * `toHaveURL` assertion right after the app itself navigates there and
     * issues the token (e.g. straight after creating a project) -- so the
     * id and token don't need to be known ahead of time.
     */
    settingsWithTokenUrlPattern: (): RegExp => /\/p\/[^/]+\/settings\?t=[^&]+$/,
    requirements: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/define/requirements`, token),
    standards: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/define/standards`, token),
    artifacts: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/define/artifacts`, token),
    chat: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/define/chat`, token),
    canvas: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/design/canvas`, token),
    specifications: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/design/specifications`, token),
    build: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/build/agent`, token),
    repository: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/build/repository`, token),
    database: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/build/database`, token),
    deploy: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/ship/environments`, token),
    audit: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/ship/audit`, token),
    present: (id: string, token?: string) =>
      withToken(`/p/${id}/v/current/ship/present`, token),
  },
};
