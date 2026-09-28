import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useNoPrimaryAction, type SimpleRoute } from "./types";

const TeamPortfolio = lazyWithRetry(() => import("@/pages/assurance/TeamPortfolio"));
const Application = lazyWithRetry(() => import("@/pages/assurance/Application"));

/**
 * Assurance routes (T130, WP-A1; extended T131, WP-A2). See
 * contracts/routes.md §1, "Layout: Assurance": `/assurance/t/:teamId` (team
 * portfolio, NA-01/NA-02) and `/assurance/t/:teamId/apps/:appId`
 * (application page, NA-03/NA-04). The `path` here is relative to the
 * `assurance` parent route added in `app/router.tsx` (matches the
 * `p/:projectId` + `PROJECT_TOOL_ROUTES` pattern). `title` is a static
 * fallback only — each page overrides it with loaded data via `PageHeader`'s
 * `title` prop. Neither route publishes a dynamic primary action through
 * this registry (`useNoPrimaryAction`): see `pages/assurance/Application.tsx`'s
 * header comment for why (`PageHeader`/`PrimaryActionSlot` don't implement
 * `ActionSpec.confirm`/`.undo`, which every action here needs).
 */
export const ASSURANCE_ROUTES: SimpleRoute[] = [
  { path: "t/:teamId", title: "Team portfolio", usePrimaryAction: useNoPrimaryAction, Component: TeamPortfolio },
  { path: "t/:teamId/apps/:appId", title: "Application", usePrimaryAction: useNoPrimaryAction, Component: Application },
];
