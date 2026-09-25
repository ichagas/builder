# Building vs. after release: three approaches (Blueprint)

**Status:** Draft for decision · **Date:** 2026-09-24 · **Visual style:** Blueprint (chosen) · **Compare:** open `compare-lifecycle.html`

## Scope

Pronghorn is for **building** an app and then **changing** it: bug fixes, enhancements and features. It does **not** manage the running app: no health dashboards, error tracking, incidents, alerts or production rollback. "After release" in this document means *the app has had its first release, and work is now changes to it.*

Bugs and requests come from **people** (testers, help desk, product owners, program areas). They land in Pronghorn for triage.

## Review of the previous "Live" design, and why it's gone

The earlier Option A prototype had a **Live** section with uptime, error rate, latency, error groups, feedback, and a "Create bug from error" action. It no longer fits the scope:

- **It duplicated operations tooling.** Health and error monitoring belong in the hosting platform (for example Azure Monitor or App Insights), not in the build tool.
- **It implied responsibility Pronghorn doesn't have.** A "production healthy" pill suggests Pronghorn watches production. It doesn't, and a stale green dot is worse than none.
- **It pulled attention from the real post-release job:** deciding what to change next, doing it safely against a locked baseline, and releasing it in order.

**What stays from that design:** triage of incoming requests, the structured bug report, *Regression* requirements, and preview per change. **Removed:** the Live screen, the health pill, error/feedback feeds, the rollback plan, and "errors close when a fix ships".

## What all three approaches share

- The Blueprint shell: navy chrome, dense rows, monospace font for identifiers.
- **A locked baseline after the first release.** `main` is protected, and every change gets a branch and a preview.
- Change types (bug, enhancement, feature) with type-specific paths. Bugs skip Design by default.
- Requirement deltas (*New*, *Changed*, *Regression*) compared with the released baseline.
- A release step that merges, tags, and deploys with the existing Deploy settings.
- The five UX principles: task hierarchy, progressive disclosure, state in the URL, thumb-reach primary action, and immediate feedback with Undo.

## Approach 1: Baseline + work items (`style-2-blueprint.html`)

One navigation for the project's whole life. After the first release, **Work** and a **Working on** switcher appear above the four phases, and selecting a work item re-scopes the phases to it. A context bar shows which item you're in.

- **Stage signal:** subtle. New rail entries appear. Nothing else changes.
- **Good:** nothing to relearn, and the cheapest to build on Option A.
- **Risk:** it's easy to forget whether you're looking at the baseline or a change. Release planning is thin (one "next release" list).
- The "before release" state wasn't prototyped separately. It's the original Option A.

## Approach 2: Build mode → Evolve mode (`approach-2-modes.html`)

The project has **two explicit modes**, and the first release is the switch between them.

**Build mode (before the first release)**
- The rail is the four phases with progress. The rail card shows *Building v1.0.0* and the number of release checks passed.
- The agent commits directly to `main`, which the Build page says openly.
- Ship → **First release** shows release checks (criteria, audit coverage, tests, security scan, Test environment, sign-off). Each failing check has its own fix action. Confirming **Release v1.0.0** shows the steps: merge and tag → deploy → lock the baseline → switch mode.

**Evolve mode (after release)**
- The rail becomes **Changes** and **Releases**, plus a locked **Baseline** group: Requirements, Architecture, Code and Data, each marked with a lock.
- **The four phases move inside each change** as a horizontal stepper (Define → Design → Build → Ship), with a skipped step shown dashed.
- The Baseline pages are read-only, with **Propose a change** as the primary action.
- **Stage signal:** strong. A 3px color band on the top bar (blue while building, green after release), a mode badge, and a different rail.
- **Good:** very clear for mixed teams. Each change is a focused page. Baseline and change are never confused.
- **Risk:** two navigations to learn and maintain. Moving the phases from the rail into the change is the biggest mental shift.

## Approach 3: Version timeline (`approach-3-versions.html`)

The **version** is the unit of work. A **timeline strip** under the top bar is always visible:

```
 v1.0.0 ⚑First release  3 more  v1.4.1  ●v1.4.2  ○v1.4.3  ◉v1.5.0  ◌v1.6.0
 ─── build era ──┘└──────────── released ───────────┘└─ hotfix ─ next ─ planned ─
```

- **Before the first release:** the timeline shows *Start → v1.0.0 (building) → First release (not yet)*. Everything built now ships as v1.0.0.
- **After:** requests arrive **Not scheduled**. You schedule each one into the **next release** or a **hotfix** (created on demand). Selecting a version scopes the rail's four phases to it, with totals across its changes (for example "1 in progress · 1/2 done"). Each phase page is a board of that version's changes with a per-change action (Mark ready, Approve, Send for review).
- **Ship** releases a version. Versions go out **in order** (the button explains why it's disabled). **Unfinished changes move to the next version automatically.**
- Released versions are read-only. The primary action is "Change this in v1.5.0".
- **Stage signal:** clear and spatial. You always see where you are relative to the First release flag.
- **Good:** release planning, hotfixes and "what ships when" are built in, and it's a natural fit for release notes.
- **Risk:** focusing on one change is weaker (it's a card within a version board). It needs version discipline from teams that just want to fix one bug.

## Comparison

| | 1 · Baseline + items | 2 · Build → Evolve modes | 3 · Version timeline |
|---|---|---|---|
| How clearly you can tell the stage | ★☆☆ | ★★★ | ★★☆ |
| Focus on one change | ★★☆ | ★★★ | ★☆☆ |
| Release planning and hotfixes | ★☆☆ | ★★☆ | ★★★ |
| Learnability for non-developers | ★★☆ | ★★★ | ★★☆ |
| Build effort | Low | Medium | Medium to high |

## Recommendation

**Approach 2 (Build mode → Evolve mode)**, borrowing two ideas from Approach 3:

1. **Two modes match the real shift in work.** Before release, people work across the whole system phase by phase. After release, they work on one change at a time against something that must not break. Changing the navigation at that moment, and marking it with a deliberate release step, teaches the new rules without explanation. It also protects `main` at exactly the right time.
2. **The mode signal is always visible** (color band and badge) without taking space from the page.
3. **From Approach 3:** add the **hotfix vs. next release** choice to triage, and the **in-order release with automatic carry-over** rule to the Releases page. These cover what Approach 2's release planning lacks today, without making versions the primary unit.

Choose Approach 3 instead if teams mainly plan in fixed release trains, or Approach 1 if keeping Option A exactly as it is matters more than a clear stage signal.

## Build order (for Approach 2)

1. A project `stage` field (`building` | `evolving`) and the **First release** flow with checks. It locks `main`, tags v1.0.0 and deploys with the existing Deploy settings.
2. Work items (`changes`) with type, branch per change, phase state and requirement deltas. The Changes list with inline triage.
3. The change page with its stepper. Define and Build scoped to the change. Preview per change (building on `specs/006`).
4. The Baseline section (read-only views of the existing Requirements, Canvas, Repository and Database pages) with Propose a change.
5. Releases: the next release, release notes, the in-order rule and carry-over, and hotfix versions.
