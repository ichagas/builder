# Orchestrate spec 007: Pronghorn Frontend Redesign

You are the **orchestrator** for implementing `specs/007-frontend-new/`. You plan, dispatch, verify and merge. **Subagents do the coding and testing.** Work autonomously until the work is complete. Don't stop to ask for confirmation between tasks.

## 1. Read first (once, then keep notes)

1. `specs/007-frontend-new/{spec.md, plan.md, research.md, data-model.md, tasks.md, agents.md}` and `contracts/{design-system.md, routes.md, api.md}`
2. `.specify/memory/constitution.md` (Principle VI is the layout contract), `.github/copilot-instructions.md`, `.github/instructions/frontend-new.instructions.md`, `api.instructions.md`, `infra.instructions.md`, `cicd.instructions.md`
3. `.github/agents/{code-review,testing,security}.agent.md`: the review, test and security rules subagents must apply
4. Prototypes: `docs/design/frontend-redesign/option-a-styles/{approach-3-versions.html, onboard-b-console.html, style-2-blueprint.html}` and `shared/*.css`

`tasks.md` is the source of truth for what to do. `agents.md` defines the work packages (WPs), waves, file ownership, prompt template and definition of done. Follow them. **Don't re-decide anything in `research.md`.**

## 2. Branch and progress log

- Start from `design/frontend-redesign`. Create and work on **`feature/frontend-new`**. Never commit to `main`. Don't push unless every task is done (see §8).
- Keep a progress log at `specs/007-frontend-new/progress.md`, with one line per task (`T### · status · commit sha · notes`), and the current wave and open blockers. Update it after every merge. **If your context is compacted or the session restarts, read this file and `tasks.md` first and continue from there.**

## 3. Agents and models

Use the Agent tool for all implementation and testing. Keep your own context for planning, dispatching, verifying and merging.

| Role | When | Model |
|---|---|---|
| **Developer** | Implements the tasks of one WP | **Sonnet 5** (`model: "sonnet"`) |
| **Tester** | Writes and runs the WP's unit, E2E and axe tests; checks the definition of done | **Sonnet 5** |
| **Reviewer** | Applies `code-review.agent.md` (layout contract, constitution, layer validation) to the WP diff | **Sonnet 5** |
| **Security reviewer** | WPs BE4, BE5, BE6, BE7, BE8: applies `security.agent.md` | **Sonnet 5** |
| **Escalation** | Only when needed (see below) | **Opus 5.5** (`model: "opus"`) |

**Use Opus 5.5 only when:**
- a Sonnet developer has failed the same task **twice** (tests or review still failing after two fix rounds), or
- a problem crosses layers or contracts and the spec doesn't settle it (e.g. a data-model or API contract conflict), or
- a security finding needs judgment to resolve.

Give the Opus agent the failing context and ask for a fix or a decision. Then continue with Sonnet. Record every escalation in `progress.md`.

**Isolation and parallelism:**
- Run the WPs of a wave **in parallel**, each in its own git worktree (`isolation: "worktree"`) on a branch `wp/<WP-ID>` from `feature/frontend-new`.
- Respect `agents.md` file ownership so parallel WPs don't collide. Shared code belongs to the foundation WPs.
- Don't start a wave until every WP it depends on is merged.
- Aim for 5–6 concurrent agents. Wave 3 (20 restyle WPs) can run in batches.

## 4. Per work package loop

For each WP in the current wave:

1. **Dispatch the Developer** (Sonnet 5, worktree) with the prompt template from `agents.md`, filled in: WP ID, tasks, owned files, prototype, legacy files to match (restyle WPs) and acceptance criteria. Instructions:
   - **Commit once per task** (`T###`) as soon as that task is done and its checks pass.
   - Commit message: `T### (WP-XX): <short summary>`, then a blank line, a body listing what changed and how it was verified, and the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
   - Tick the task in `tasks.md` in the same commit.
   - Run the layer validation before each commit: `npm run lint` + `npm run build` + `npm test` in `app/frontend-new/`, `npm run build` + `npm test` in `app/backend/` for backend tasks.
2. **Dispatch the Tester** (Sonnet 5, same worktree) after the developer reports done. It runs the WP's tests (regression rows `PR-xx`, capability rows `NV/NA/NO-xx`, axe, and for restyle WPs screenshots at 1440 and 390). It fixes test code only, or reports defects.
3. **Dispatch the Reviewer** (Sonnet 5), plus the **Security reviewer** where listed, on the WP diff.
4. If the tester or reviewers report defects, send them back to the Developer. After **two** failed rounds, escalate to Opus 5.5 (§3).
5. When everything is green, **merge `wp/<WP-ID>` into `feature/frontend-new`** with a merge commit (`Merge WP-XX: <title>`), which keeps the per-task commits. Run the full frontend and backend validation on `feature/frontend-new` after the merge. If it breaks, fix it before starting the next merge.
6. Update `progress.md`.

**Verify, don't trust.** Before merging, read the diff summary and run the checks yourself. A subagent saying "done" isn't evidence.

## 5. Order of work

Follow the waves in `agents.md`:

- **Wave 0:** F0 is already done (constitution v2.0.0, instructions, clarifications). Don't redo it.
- **Wave 1:** F1 (copy the frontend, CI, container, Terraform code), F6 (test harness + **legacy smoke suite T017, which must pass on `app/frontend` before any restyle WP starts**), BE1, BE3, BE7.
- **Wave 2:** F2, F2b, F3, F5, BE2, BE4, BE8.
- **Wave 3:** the 20 restyle WPs + BE5.
- **Wave 4:** X0, V1–V4, A1–A6, BE6.
- **Wave 5:** X1, X2, O1, O2.
- **Then:** Phase 12 polish (T160–T162).
- **Phase R is out of scope.** Only do T170–T171 (select pages and create the follow-up specs). Don't rewrite pages.

**Specific rules:**
- **T010** (copy the frontend) is one commit containing only the copy. The rename goes in the next commit.
- **Restyle WPs must not change behavior.** The same smoke test must pass on legacy and on the new app.
- **T074** (remove `app/frontend/`) happens only after X0's full regression run is green, and it's the **last** frontend task.

## 6. Work that needs access you may not have

Some tasks touch cloud resources, secrets or systems outside this repo: Terraform **apply**, Azure resources, DNS or Front Door, the Entra app registration, GitHub App permissions, Key Vault secrets, the external repo `goa-standards/assurance-mesh` (BE7), and the real host switch (T073).

- **Do all the code and config** for them: Terraform, workflows, templates, scripts, docs. Validate what can be validated locally (`terraform fmt`, `terraform validate`, workflow syntax, unit tests with mocks).
- **Never** run `terraform apply`, change cloud resources, create or read real secrets, push to a remote, or open PRs outside this repo.
- For BE7, build the external repo's content in `external/goa-standards-assurance-mesh/` in this repo, so it can be moved out later.
- Mark such tasks in `tasks.md` as `- [~] T### … (BLOCKED-EXTERNAL: <what a human must do>)`, commit, record them in `progress.md`, and **keep going** with everything that doesn't depend on them.
- If Docker or the local stack is unavailable for E2E, stop only the E2E part. Run everything else, record the gap, and retry E2E later in the run.

## 7. Guardrails

- Follow the constitution and the layout contract. The reviewer rejects deviations.
- Don't modify `app/frontend/` except what T017 needs (test hooks) and its final removal (T074).
- No force-push, no history rewriting, no deleting branches other than merged `wp/*` branches.
- Don't weaken tests to make them pass. Fix the code, or record a defect.
- Keep secrets out of the repo. Use `.env.example` placeholders only.

## 8. When to stop

Stop only when **all** of these are true:

1. Every task in `tasks.md` (Phases 0–12, plus T170–T171) is `[X]`, or `[~]` with a BLOCKED-EXTERNAL reason.
2. On `feature/frontend-new`: lint, build and unit tests pass for `app/frontend-new/` and `app/backend/`. The regression suite (`PR-01…PR-22`) and the new-capability E2E pass, except runs recorded as blocked by the environment.
3. `specs/007-frontend-new/checklists/regression.md` and `progress.md` are complete.

Then push `feature/frontend-new` to `origin` (never `main`) and write a final report in `progress.md` and in chat:
- what's done
- every BLOCKED-EXTERNAL item and the exact human step it needs
- test results
- escalations to Opus 5.5 and why
- anything that deviated from the spec

**Don't stop earlier** for confirmation, progress summaries or wave boundaries. Keep going.
