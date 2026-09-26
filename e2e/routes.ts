/**
 * Logical page -> URL mapping for legacy and new apps (contracts/routes.md §1).
 *
 * Tests must never navigate via the legacy sidebar/nav (the new app replaces
 * it): always go through one of these helpers, which return a path relative
 * to BASE_URL. Which URL shape you get depends on APP=legacy|new.
 *
 * The new app's routes don't exist yet (WP-F6 only runs APP=legacy), but the
 * mapping is written now so page-task agents can flip APP=new later without
 * touching test bodies.
 */

export type App = "legacy" | "new";

export function currentApp(): App {
  const app = (process.env.APP || "legacy").toLowerCase();
  if (app !== "legacy" && app !== "new") {
    throw new Error(`Unknown APP env var "${app}". Use "legacy" or "new".`);
  }
  return app;
}

/** Appends a share-token query/path segment per app (contracts/routes.md: legacy /t/:token, new ?t=:token). */
function withToken(legacyPath: string, newPath: string, token?: string): string {
  const app = currentApp();
  if (!token) return app === "legacy" ? legacyPath : newPath;
  return app === "legacy" ? `${legacyPath}/t/${token}` : `${newPath}?t=${token}`;
}

export const routes = {
  welcome: () => (currentApp() === "legacy" ? "/" : "/welcome"),
  auth: () => "/auth",
  authCallback: () => "/auth/callback",
  githubCallback: () => "/github/callback",
  terms: () => "/terms",
  privacy: () => "/privacy",
  license: () => "/license",

  projectsHome: () => (currentApp() === "legacy" ? "/dashboard" : "/projects"),
  gallery: () => (currentApp() === "legacy" ? "/gallery" : "/library/gallery"),
  standardsLibrary: () => (currentApp() === "legacy" ? "/standards" : "/library/standards"),
  techStacks: () => (currentApp() === "legacy" ? "/tech-stacks" : "/library/tech-stacks"),
  buildBooks: () => (currentApp() === "legacy" ? "/build-books" : "/library/build-books"),
  buildBookNew: () => (currentApp() === "legacy" ? "/build-books/new" : "/library/build-books/new"),
  buildBookDetail: (id: string) =>
    currentApp() === "legacy" ? `/build-books/${id}` : `/library/build-books/${id}`,
  buildBookEdit: (id: string) =>
    currentApp() === "legacy" ? `/build-books/${id}/edit` : `/library/build-books/${id}/edit`,
  settingsProfile: () => "/settings/profile",
  settingsOrganization: () => "/settings/organization",
  adminIntegrations: () => "/admin/integrations", // new-only (US5); not exercised against legacy

  project: {
    settings: (id: string, token?: string) =>
      withToken(`/project/${id}/settings`, `/p/${id}/settings`, token),
    requirements: (id: string, token?: string) =>
      withToken(`/project/${id}/requirements`, `/p/${id}/v/current/define/requirements`, token),
    standards: (id: string, token?: string) =>
      withToken(`/project/${id}/standards`, `/p/${id}/v/current/define/standards`, token),
    artifacts: (id: string, token?: string) =>
      withToken(`/project/${id}/artifacts`, `/p/${id}/v/current/define/artifacts`, token),
    chat: (id: string, token?: string) =>
      withToken(`/project/${id}/chat`, `/p/${id}/v/current/define/chat`, token),
    canvas: (id: string, token?: string) =>
      withToken(`/project/${id}/canvas`, `/p/${id}/v/current/design/canvas`, token),
    specifications: (id: string, token?: string) =>
      withToken(`/project/${id}/specifications`, `/p/${id}/v/current/design/specifications`, token),
    build: (id: string, token?: string) =>
      withToken(`/project/${id}/build`, `/p/${id}/v/current/build/agent`, token),
    repository: (id: string, token?: string) =>
      withToken(`/project/${id}/repository`, `/p/${id}/v/current/build/repository`, token),
    database: (id: string, token?: string) =>
      withToken(`/project/${id}/database`, `/p/${id}/v/current/build/database`, token),
    deploy: (id: string, token?: string) =>
      withToken(`/project/${id}/deploy`, `/p/${id}/v/current/ship/environments`, token),
    audit: (id: string, token?: string) =>
      withToken(`/project/${id}/audit`, `/p/${id}/v/current/ship/audit`, token),
    present: (id: string, token?: string) =>
      withToken(`/project/${id}/present`, `/p/${id}/v/current/ship/present`, token),
  },
};
