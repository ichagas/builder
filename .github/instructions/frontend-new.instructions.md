---
applyTo: "app/frontend-new/**"
---

# Frontend Layer (new) — Pronghorn Web App Redesign

This is the new frontend from spec `specs/007-frontend-new/`. It starts as a copy of `app/frontend/` and is redesigned to the layout contract. It replaces `app/frontend/` at switch-over.

## Read before changing anything
- `specs/007-frontend-new/spec.md`, `plan.md` (especially **the move and restyle recipe**), `research.md`, `agents.md`
- `specs/007-frontend-new/contracts/design-system.md`: **the layout contract** (Constitution Principle VI)
- Prototypes: `docs/design/frontend-redesign/option-a-styles/approach-3-versions.html` (Builder), `onboard-b-console.html` (Assurance)

## Stack
- The same as the legacy app: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, MSAL.
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

## New screens
- Inline feedback through `ActionButton`, `UndoBar` and `StatusCenter`. Use a toast only for events with no place on screen.
- Use translation keys (`react-i18next`, English only for now; research D-16).

## Shared code ownership
`components/shell`, `components/ui`, `design`, `lib/state`, `app/router.tsx` and `index.css` belong to the foundation work packages. Request changes with a `shell-change` issue.

## Testing
- Unit: Vitest (`npm test` in `app/frontend-new/`).
- E2E: Playwright regression and new-capability specs (see `specs/007-frontend-new/tasks.md`), axe on touched routes.
- Validate: `npm run lint` + `npm run build` + `npm test` in `app/frontend-new/`.

## Legacy app
Don't change `app/frontend/`. It's the regression reference only (pre-go-live pivot). Fix bugs here, in `app/frontend-new/`.
