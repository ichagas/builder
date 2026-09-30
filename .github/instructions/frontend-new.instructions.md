---
applyTo: "app/frontend-new/**"
---

# Frontend Layer — Pronghorn Web App (redesign)

This is the only frontend, from spec `specs/007-frontend-new/`. It began as a fork of the former legacy app and is built to the layout contract. The legacy frontend was removed in T074.

## Read before changing anything
- `specs/007-frontend-new/spec.md`, `plan.md` (especially **the move and restyle recipe**), `research.md`, `agents.md`
- `specs/007-frontend-new/contracts/design-system.md`: **the layout contract** (Constitution Principle VI)
- Prototypes: `docs/design/frontend-redesign/option-a-styles/approach-3-versions.html` (Builder), `onboard-b-console.html` (Assurance)

## Stack
- React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, MSAL.
- Auth: MSAL / Azure Entra ID via `src/config/`, `src/contexts/`. AI config: `src/config/aiModels.ts` (Azure Foundry only; all AI calls go through the API).
- Direct **Web App → API** communication. All data fetching goes through the API endpoints.
- Use the `@/` import alias (`@/* → src/*`). Reuse components from `src/components/`, hooks from `src/hooks/`, utilities from `src/lib/` and `src/utils/` before creating new ones.
- Existing pages keep the forked data layer (`src/lib/pronghornApiAdapter.ts`, `useRealtime*` hooks, contexts).
- New-capability features (`src/features/versions|changes|teams|portfolio|applications|packs|mesh|onboarding|admin`) use TanStack Query hooks in `features/<domain>/api.ts` with zod validation.

## UI/UX Layout Contract (NON-NEGOTIABLE)
- **Follow the contract.** New layouts, navigation and page structure defined by it are allowed and expected.
- **The shell owns navigation.** Pages MUST NOT render `PrimaryNav`, `ProjectSidebar`, `ProjectPageHeader` or any other navigation. The global bar, rail, timeline strip, status pill, undo slot and mobile tab bar come from `src/components/shell/`.
- **One primary action per page**, declared in the route metadata (`src/app/routes/*.tsx`) and rendered by `PageHeader`.
- **Tool and tab live in the URL** (`useUrlState`).
- **Tokens only.** No raw Tailwind palette classes or hex colors outside `src/design/` (the token lint enforces this).
- **Changing the contract itself** (shell structure, information architecture, tokens, interaction patterns) means updating `contracts/design-system.md` and the prototypes in the same PR.

## Restyle work (existing pages)
- **Behavior must not change.** Keep page logic, data calls, dialogs and toasts. Change only layout, navigation, tabs-in-URL, tokens and phone layout. Deeper changes are Phase R (research D-14).
- Apply the recipe in `plan.md`, and pass the page's regression rows (`PR-xx`) at 1440 and 390 with axe.
- **Declaring a live primary action.** The route registry's `usePrimaryAction` (`app/routes/types.ts`) is a plain no-arg hook, so a page can't pass it per-render state (dirty/pending/disabled) as an argument, and the registry can't call the page's own data hooks a second time without duplicating fetches. When the action depends on the page's own render, use `createPrimaryActionStore` (`src/lib/state/createPrimaryActionStore.ts`) instead of hand-rolling a `useSyncExternalStore`:

  ```ts
  // <page>.primaryAction.ts
  const store = createPrimaryActionStore();
  export const usePublishXPrimaryAction = store.usePublishPrimaryAction;
  export const useXPrimaryAction = store.usePrimaryAction; // referenced from the route registry

  // Inside the page component, on every render:
  usePublishXPrimaryAction(canAdd ? { label: "Add thing", onClick: addThing } : undefined);
  ```

  If the action is a constant (no page state involved, e.g. it just opens a dialog), skip the store and export a plain `UsePrimaryAction` hook instead — see `pages/dashboard.primaryAction.ts`.

## New screens
- Inline feedback through `ActionButton`, `UndoBar` and `StatusCenter`. Use a toast only for events with no place on screen.
- Use translation keys (`react-i18next`, English only for now; research D-16).

## Shared code ownership
`components/shell`, `components/ui`, `design`, `lib/state`, `app/router.tsx` and `index.css` belong to the foundation work packages. Request changes with a `shell-change` issue.

## Testing
- Unit: Vitest (`npm test` in `app/frontend-new/`; tests live next to the code and in `src/test/`; config `vitest.config.ts`).
- E2E: Playwright regression and new-capability specs (see `specs/007-frontend-new/tasks.md`), axe on touched routes.
- Validate: `npm run lint` + `npm run build` + `npm test` in `app/frontend-new/`.

## Patterns
- Follow existing Tailwind token/theme usage; do not hard-code new design tokens.
- Keep state/data-fetching patterns consistent with existing React Query and context usage.
- Respect MSAL/Azure auth integration and existing env-var-driven configuration (`app/frontend-new/.env.example`).
- When adding or modifying shadcn/ui components, follow the `shadcn-ui` skill guidance for Radix UI primitives, Tailwind CSS theming, and accessible component patterns.

## MCP Tools Available
- **GitHub MCP**: PR context, code review, file contents

## Production Quality Skills (installed via `npx skills`)
The following skills are installed in `.agents/skills/` and provide detailed guidance for production-quality frontend development:

- **`accessibility`** — WCAG 2.2 compliance, screen reader support, keyboard navigation, ARIA patterns, color contrast. Use for any new component or UI change.
- **`performance`** — Web performance optimization: lazy loading, code splitting, bundle analysis, image optimization, caching strategies.
- **`core-web-vitals`** — LCP, INP, CLS optimization for page experience and search ranking.
- **`best-practices`** — Modern web security, compatibility, code quality patterns. CSP, HTTPS, input validation.
- **`shadcn-ui`** — Component patterns for shadcn/ui with Radix UI, Tailwind CSS theming, accessible variants, form validation with Zod.
