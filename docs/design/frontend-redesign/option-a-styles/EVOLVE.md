# Option A after the first release: Approach 1, baseline + work items

**Status:** Draft for decision · **Date:** 2026-09-24 · **Builds on:** `../PROPOSAL.md` (Option A: Lifecycle Rail) · **Compared in:** `LIFECYCLE.md`

**Scope:** Pronghorn covers building an app and then changing it: bug fixes, enhancements and features. It does **not** operate the running app. There is no health monitoring, error tracking, incidents or production rollback. Bugs and requests come from people (testers, help desk, product owners) and are triaged in Pronghorn.

This is the first of three ways to separate a project that's being built from one that has been released. It keeps Option A's shell and adds a layer for changes.

Prototype: `style-2-blueprint.html` (the same flows also run in `style-1-clarity.html` and `style-3-studio.html`).

---

## 1. Core idea: baseline + work items

After the first release, a project has two kinds of context:

| Context | What it is | What you can do |
|---|---|---|
| **Baseline** | The released version (for example `v1.4.2`): requirements, canvas, specs, code on `main`, data model. | Read, search, and start a work item. **Editing is locked**, because `main` is protected after the first release. |
| **Work item** | One change: a **bug**, an **enhancement** or a **feature**. Each has its own ID (`WI-42`), branch, preview and trip through the four phases. | Everything. The phases show only what this item changes, compared with the baseline. |

The rail gets a **"Working on" switcher** above the phases. When a work item is active, a **context bar** across the top shows its type, ID, title, branch and progress, plus "Back to baseline".

Before the first release, none of this appears. The project looks like the original Option A: four phases with progress, and the agent commits to `main`.

## 2. Work

**Work** sits above the phases in the rail and is the first tab on phones. It lists every change by stage: **Needs triage → In progress → In release vX → Shipped**, and can be filtered to bugs, enhancements or features. Each row shows a 4-segment phase track.

Triage happens in place. Expanding a request shows who reported it and the details, and offers accept, change type or decline. Accepting creates the branch and starts the item in Define, with Undo available.

## 3. The type decides the path

| Type | Default path | Why |
|---|---|---|
| **Bug** | Define → *(Design skipped)* → Build → Ship | Define holds a structured bug report (steps, expected, actual) and marks the affected requirement as a **Regression** with a new acceptance criterion. That criterion becomes the regression test. |
| **Enhancement** | Define → Design → Build → Ship | Changes an existing requirement. |
| **Feature** | Define → Design → Build → Ship | Adds new requirements and usually new components. |

A skipped phase still shows in the rail (as a dashed node) and offers **Add a design step**.

## 4. What each phase shows

| Phase | In the baseline | Inside a work item |
|---|---|---|
| **Define** | The full requirement tree for the released version | Only the delta (*New*, *Changed*, *Regression*). Unchanged requirements are collapsed. |
| **Design** | The architecture as released | Affected nodes highlighted, new ones dashed, the rest dimmed |
| **Build** | `main` (protected) and the open branches | The item's branch, agent run, staged files, tests and commit options (collapsed). **Send for review** creates a preview. |
| **Ship** | The next release: ready items, release notes and the pipeline. **Release vX** asks for confirmation. | Release checks (tests, audit for regressions against the baseline, review) and the preview URL. **Add to vX**. |

## 5. What this needs from the product

1. A `work_items` table: `id, project_id, type, title, status, phase_state, branch, preview_url, release, source, severity`.
2. Requirement deltas per work item (`new | changed | regression`), applied to the baseline on release.
3. Lock `main` after the first release. Agents always work on a branch per item. The staging flow (`specs/003`, `004`) stages per repo today, so it needs a branch dimension.
4. A preview per work item. `specs/006` is the natural place to add per-branch deploys.
5. Releases: a named set of work items, merged, tagged and deployed with the existing Deploy settings.
6. A regression audit: run the existing Audit pipeline against the baseline requirements before release.
