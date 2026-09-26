import * as React from "react";
import { Suspense } from "react";
import { Navigate, Outlet, createBrowserRouter } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import { PageLoader } from "@/components/PageLoader";
import { useAuth } from "@/contexts/AuthContext";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { CommandPaletteItemsProvider, useCommandPaletteItems } from "@/components/shell/CommandPaletteItemsContext";
import { CommandPaletteOpenContext } from "./CommandPaletteOpenContext";
import { lazyWithRetry } from "./lazyWithRetry";
import { PublicLayout } from "./layouts/PublicLayout";
import { RootLayout } from "./layouts/RootLayout";
import { ProjectLayout } from "./layouts/ProjectLayout";
import { ROOT_ROUTES } from "./routes/root";
import { LIBRARY_ROUTES } from "./routes/library";
import { PROJECT_TOOL_ROUTES } from "./routes/project";
import { NotFound } from "./routes/NotFound";
import { buildLegacyRedirectRoutes } from "./redirects";

// Clear the chunk-reload flag left by lazyWithRetry on a successful load
// (moved here from the pre-router App.tsx, T033).
sessionStorage.removeItem("chunk_reload");

const Landing = lazyWithRetry(() => import("@/pages/Landing"));
const Auth = lazyWithRetry(() => import("@/pages/Auth"));
const AuthCallback = lazyWithRetry(() => import("@/pages/AuthCallback"));
const GitHubCallback = lazyWithRetry(() => import("@/pages/GitHubCallback"));
const Terms = lazyWithRetry(() => import("@/pages/Terms"));
const Privacy = lazyWithRetry(() => import("@/pages/Privacy"));
const License = lazyWithRetry(() => import("@/pages/License"));
const ProjectSettings = lazyWithRetry(() => import("@/pages/project/ProjectSettings"));

/** `/` shows Landing when signed out, and redirects to `/projects` when signed in (contracts/routes.md §1). */
function RootIndex() {
  const { user } = useAuth();
  if (user) return <Navigate to="/projects" replace />;
  return <Landing />;
}

/**
 * Root route element (T033): the one-time app-wide providers that aren't
 * per-layout — `ScrollToTop` (needs router context, so it can't live in
 * main.tsx), the chunk-loading `Suspense` boundary, and the ⌘K palette
 * (mounted once so its global keyboard shortcut always works, regardless
 * of which layout/route is active).
 */
function RootProviders() {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const openPalette = React.useCallback(() => setPaletteOpen(true), []);

  return (
    <CommandPaletteItemsProvider>
      <CommandPaletteOpenContext.Provider value={openPalette}>
        <ScrollToTop />
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
        <PaletteHost open={paletteOpen} onOpenChange={setPaletteOpen} />
      </CommandPaletteOpenContext.Provider>
    </CommandPaletteItemsProvider>
  );
}

function PaletteHost({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const items = useCommandPaletteItems();
  return <CommandPalette open={open} onOpenChange={onOpenChange} items={items} />;
}

export const router = createBrowserRouter([
  {
    element: <RootProviders />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <RootIndex /> },
          { path: "welcome", element: <Landing /> },
          { path: "auth", element: <Auth /> },
          { path: "auth/callback", element: <AuthCallback /> },
          { path: "github/callback", element: <GitHubCallback /> },
          { path: "terms", element: <Terms /> },
          { path: "privacy", element: <Privacy /> },
          { path: "license", element: <License /> },
        ],
      },
      {
        element: <RootLayout />,
        children: [
          ...ROOT_ROUTES.map((route) => ({ path: route.path, element: <route.Component /> })),
          ...LIBRARY_ROUTES.map((route) => ({ path: `library/${route.path}`, element: <route.Component /> })),
          { path: "*", element: <NotFound /> },
        ],
      },
      {
        path: "p/:projectId",
        element: <ProjectLayout />,
        children: [
          { path: "settings", element: <ProjectSettings /> },
          ...PROJECT_TOOL_ROUTES.map((route) => ({
            path: `v/current/${route.phase}/${route.tool}`,
            element: <route.Component />,
          })),
        ],
      },
      ...buildLegacyRedirectRoutes(),
    ],
  },
]);

export default router;
