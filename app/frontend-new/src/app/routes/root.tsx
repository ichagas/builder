import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useNoPrimaryAction, type SimpleRoute } from "./types";

const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const Settings = lazyWithRetry(() => import("@/pages/Settings"));

/** Top-level (non-project, non-library, non-public) routes. See contracts/routes.md §1. */
export const ROOT_ROUTES: SimpleRoute[] = [
  { path: "projects", title: "Projects", usePrimaryAction: useNoPrimaryAction, Component: Dashboard },
  { path: "settings/profile", title: "Profile settings", usePrimaryAction: useNoPrimaryAction, Component: Settings },
  { path: "settings/organization", title: "Organization settings", usePrimaryAction: useNoPrimaryAction, Component: Settings },
];
