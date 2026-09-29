import { createPrimaryActionStore } from "@/lib/state/createPrimaryActionStore";

/**
 * OnboardingWizard primary action (T150, WP-O1). See
 * `src/pages/buildBookEditor.primaryAction.ts` for the pattern this
 * follows: the wizard's "Continue" action depends on page state (the
 * current step, the pending create/select-repositories mutation, whether
 * the form is valid) that `usePrimaryAction` (a plain no-arg hook, read by
 * `PageHeader`/`app/routes/assurance.tsx`) can't be handed directly --
 * `OnboardingWizard.tsx` publishes its current "Continue" action on every
 * render instead.
 */
const onboardingWizardPrimaryActionStore = createPrimaryActionStore();

export const usePublishOnboardingWizardPrimaryAction = onboardingWizardPrimaryActionStore.usePublishPrimaryAction;
export const useOnboardingWizardPrimaryAction = onboardingWizardPrimaryActionStore.usePrimaryAction;
