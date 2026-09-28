import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useNoPrimaryAction, type SimpleRoute } from "./types";

const TeamPortfolio = lazyWithRetry(() => import("@/pages/assurance/TeamPortfolio"));

/**
 * Assurance routes (T130, WP-A1). See contracts/routes.md §1, "Layout:
 * Assurance": `/assurance/t/:teamId` (team portfolio, NA-01/NA-02). The
 * `path` here is relative to the `assurance` parent route added in
 * `app/router.tsx` (matches the `p/:projectId` + `PROJECT_TOOL_ROUTES`
 * pattern). `title` is a static fallback only — `TeamPortfolio` overrides
 * it with the team's name via `PageHeader`'s `title` prop, same as any page
 * whose heading depends on loaded data.
 */
export const ASSURANCE_ROUTES: SimpleRoute[] = [
  { path: "t/:teamId", title: "Team portfolio", usePrimaryAction: useNoPrimaryAction, Component: TeamPortfolio },
];
