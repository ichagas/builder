import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useOnboardingWizardPrimaryAction } from "@/pages/assurance/onboardingWizard.primaryAction";
import { useNoPrimaryAction, type SimpleRoute } from "./types";

const TeamPortfolio = lazyWithRetry(() => import("@/pages/assurance/TeamPortfolio"));
const OnboardingWizard = lazyWithRetry(() => import("@/pages/assurance/OnboardingWizard"));

/**
 * Assurance routes (T130, WP-A1; T150, WP-O1). See contracts/routes.md §1,
 * "Layout: Assurance": `/assurance/t/:teamId` (team portfolio,
 * NA-01/NA-02) and `/assurance/t/:teamId/onboard/:step?` (onboarding
 * wizard steps 1-2, NO-01/NO-02; steps 3-5 are WP-O2, T151). The `path`
 * here is relative to the `assurance` parent route added in
 * `app/router.tsx` (matches the `p/:projectId` + `PROJECT_TOOL_ROUTES`
 * pattern). `title` is a static fallback only — each page overrides it via
 * `PageHeader`'s `title` prop, same as any page whose heading depends on
 * loaded data.
 */
export const ASSURANCE_ROUTES: SimpleRoute[] = [
  { path: "t/:teamId", title: "Team portfolio", usePrimaryAction: useNoPrimaryAction, Component: TeamPortfolio },
  {
    path: "t/:teamId/onboard/:step?",
    title: "Onboard an app",
    usePrimaryAction: useOnboardingWizardPrimaryAction,
    Component: OnboardingWizard,
  },
];
