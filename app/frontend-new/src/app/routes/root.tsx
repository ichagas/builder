import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useDashboardPrimaryAction } from "@/pages/dashboard.primaryAction";
import { useNoPrimaryAction, type SimpleRoute } from "./types";
import i18n from "@/i18n";

const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const Settings = lazyWithRetry(() => import("@/pages/Settings"));
const AdminIntegrations = lazyWithRetry(() => import("@/pages/admin/AdminIntegrations"));

/**
 * Top-level (non-project, non-library, non-public) routes. See
 * contracts/routes.md §1. Title stays "Dashboard" (not the route's
 * "Projects" label used in nav/command-palette copy elsewhere) because
 * PR-01's regression spec asserts the page `<h1>` reads "Dashboard" on
 * both apps -- see plan.md "behavior must not change".
 */
export const ROOT_ROUTES: SimpleRoute[] = [
  { path: "projects", title: "Dashboard", usePrimaryAction: useDashboardPrimaryAction, Component: Dashboard },
  { path: "settings/profile", title: "Profile settings", usePrimaryAction: useNoPrimaryAction, Component: Settings },
  { path: "settings/organization", title: "Organization settings", usePrimaryAction: useNoPrimaryAction, Component: Settings },
  // — (new, US5, WP-A6): contracts/routes.md §1. Org admins only (FR-013,
  // NA-08) — AdminIntegrations itself renders a no-access state for anyone
  // else; the backend (`requireOrgAdmin`) is the real enforcement.
  { path: "admin/integrations", get title() { return i18n.t("shell.routes.integrations"); }, usePrimaryAction: useNoPrimaryAction, Component: AdminIntegrations },
];
