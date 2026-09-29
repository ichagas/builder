import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useOnboardingWizardPrimaryAction } from "@/pages/assurance/onboardingWizard.primaryAction";
import { useNoPrimaryAction, type SimpleRoute } from "./types";
import i18n from "@/i18n";

const TeamPortfolio = lazyWithRetry(() => import("@/pages/assurance/TeamPortfolio"));
const Application = lazyWithRetry(() => import("@/pages/assurance/Application"));
const AppRuns = lazyWithRetry(() => import("@/pages/assurance/AppRuns"));
const AllTeams = lazyWithRetry(() => import("@/pages/assurance/AllTeams"));
const OnboardingWizard = lazyWithRetry(() => import("@/pages/assurance/OnboardingWizard"));
const Packs = lazyWithRetry(() => import("@/pages/assurance/Packs"));
const Policy = lazyWithRetry(() => import("@/pages/assurance/Policy"));

/**
 * Assurance routes (T130, WP-A1; T131, WP-A2; T150, WP-O1). See
 * contracts/routes.md §1, "Layout: Assurance": `/assurance/t/:teamId` (team
 * portfolio, NA-01/NA-02), `/assurance/t/:teamId/apps/:appId` (application
 * page, NA-03/NA-04) and `/assurance/t/:teamId/onboard/:step?` (onboarding
 * wizard, NO-01/NO-02; steps 3-5 are WP-O2, T151). The `path` here is
 * relative to the `assurance` parent route added in `app/router.tsx`
 * (matches the `p/:projectId` + `PROJECT_TOOL_ROUTES` pattern). `title` is a
 * static fallback only — each page overrides it with loaded data via
 * `PageHeader`'s `title` prop. The portfolio and application pages publish no
 * dynamic primary action (`useNoPrimaryAction`): see
 * `pages/assurance/Application.tsx`'s header comment (`PageHeader`/
 * `PrimaryActionSlot` don't implement `ActionSpec.confirm`/`.undo`).
 */
export const ASSURANCE_ROUTES: SimpleRoute[] = [
  { path: "t/:teamId", get title() { return i18n.t("shell.routes.teamPortfolio"); }, usePrimaryAction: useNoPrimaryAction, Component: TeamPortfolio },
  { path: "t/:teamId/apps/:appId", get title() { return i18n.t("shell.routes.application"); }, usePrimaryAction: useNoPrimaryAction, Component: Application },
  // T132, WP-A3, NA-05: mesh runs by day + evidence (`?days=`, `?run=`).
  { path: "t/:teamId/apps/:appId/runs", get title() { return i18n.t("shell.routes.meshRuns"); }, usePrimaryAction: useNoPrimaryAction, Component: AppRuns },
  {
    path: "t/:teamId/onboard/:step?",
    get title() { return i18n.t("shell.routes.onboard"); },
    usePrimaryAction: useOnboardingWizardPrimaryAction,
    Component: OnboardingWizard,
  },
  // T133, WP-A4 (NA-06): organization-level pages (no team in the path).
  { path: "packs", get title() { return i18n.t("shell.routes.packs"); }, usePrimaryAction: useNoPrimaryAction, Component: Packs },
  { path: "policy", get title() { return i18n.t("shell.routes.policy"); }, usePrimaryAction: useNoPrimaryAction, Component: Policy },
  { path: "all", get title() { return i18n.t("shell.routes.allTeams"); }, usePrimaryAction: useNoPrimaryAction, Component: AllTeams },
];
