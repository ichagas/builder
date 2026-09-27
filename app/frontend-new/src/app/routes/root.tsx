import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useDashboardPrimaryAction } from "@/pages/dashboard.primaryAction";
import { useNoPrimaryAction, type SimpleRoute } from "./types";

const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const Settings = lazyWithRetry(() => import("@/pages/Settings"));

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
];
