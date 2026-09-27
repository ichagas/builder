import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";

/**
 * Translation-ready setup (T038, D-16). English only for now — no
 * extraction of existing legacy pages, per plan.md/tasks.md: this is used
 * by the shell (`src/components/shell/**`) and new-capability screens
 * (versions/changes, assurance, onboarding), not a full-app i18n rollout.
 *
 * Every shell string lives in `en.json` under the `shell` and
 * `commandPalette` namespaces so a future locale only needs a sibling JSON
 * file and an `addResourceBundle` call here — no code changes in the
 * components that call `useTranslation()`.
 */
export const defaultNS = "translation" as const;

export const resources = {
  en: { translation: en },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  defaultNS,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
