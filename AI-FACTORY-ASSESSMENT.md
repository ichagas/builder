# AI App Factory — Assessment and Build Plan

_Assessment of the Pronghorn / "AI Factory" approach for enterprise adoption._
_Source: [The AI Factory: Design and Ideation](https://thevelocitywhitepapers.com/en/paper/qthji) — Government of Alberta, Ministry of Technology and Innovation. Repo: Pronghorn Blue (MIT, alpha)._

---

## What Pronghorn actually is

Stage one of a three-stage factory, and by its authors' own scope statement, **design and ideation**:

> "we narrowed Pronghorn's scope to focus more specifically on transforming ideas and requirements into prototypes, architectures, and artifacts needed to initiate a project."

> "Those build-and-deploy features now live more fully in the next stage of the factory, Nexus, which adds the security controls and the agent observability that Pronghorn was never meant to carry."

**It does, however, still build.** The schema carries a full agentic build loop: `agent_sessions` (mode, task description, abort flag), `agent_llm_logs` (per-iteration model calls), `agent_file_operations` (source files created and modified), `agent_blackboard` (shared memory across a multi-agent team), `build_sessions` (`branch`, `max_epochs` default 10, `current_epoch`, `preview_url`), `repo_files` and `repo_commits` (`commit_sha`, `files_changed`, `pushed_at`, `github_sha`), and `project_agents` (per-project agent type and config). `rpc.ts` touches those tables 39 times — implemented, not aspirational. `github.ts` is thin (52 lines) because it only creates the repository; the writing, committing and pushing happen elsewhere.

So the full path is: ideas → requirements tree → architecture canvas → agent team → epoch-based build loop writing real files → commits pushed to GitHub → container built and deployed to an Azure Container App with a preview URL.

What it is *not* is a delivery pipeline: ten epochs, a preview tier, and a deploy path hardwired to Azure Container Apps. Azure-native, MIT-licensed, alpha, Government of Alberta.

The real idea is **a spec-and-standards factory feeding coding agents**, not a system that autonomously ships apps. Judged on that, it holds up well.

## Pronghorn and Nexus are not two stages of one pipeline

Worth settling early, because the vendor framing ("Nexus is the next step after Pronghorn") implies a coupling that does not exist.

**They are different categories of thing.** Pronghorn is an *application* — a browser tool that turns documents and ideas into requirements, architecture and artifacts. Nexus is an *environment* — per-developer sandbox VMs on Google Cloud where humans and agents work, with terminal, browser, filesystem, publishing controls, audit over every action, PII filtering through the Bifrost gateway, and budget caps. One produces drawings; the other is the floor where work happens.

The Nexus paper frames four **approaches** — AI Garage (1) and AI Factory (2) doing direct remediation and development, orchestrator agents over hundreds of legacy applications (3), and a headless agent layer exposing government functions via API (4). Nexus is not one of those approaches; it is the platform that enables 1–2 and blueprints 3–4. Pronghorn is a tool used inside approach 2.

| | Pronghorn | Nexus |
| --- | --- | --- |
| Kind of thing | Web application | Sandboxed compute environment |
| Input | Unstructured docs, transcripts, ideas | A developer with a prompt, plus repos and credentials |
| Work done in it | Decompose, design, link to standards | Agents write, run, test and publish code |
| Output | Requirement tree, architecture, spec bundle, prototype | A running app behind a private endpoint, plus audit logs |
| Problem solved | Teams skip design and hit security and architecture gaps | Getting a safe, tooled environment takes weeks of tickets |
| Cloud | Azure (Microsoft partnership) | Google Cloud |
| Scale to date | Alpha | 600+ applications in three months |

**The two "deploys" are different things.** Pronghorn's deploy button dispatches its own `.github/workflows/genapp-deploy.yml`: bootstrap a per-app Key Vault (`kv-ga-{18 hex of app UUID}`), build and push the image to the shared ACR, then Terraform a dedicated resource group, managed identity and Container App with per-app state at `genapp/{app_id}.tfstate`, under `create` / `deploy` / `destroy`. It deploys *the prototype Pronghorn generated*, tied to the project record and destroyed with it — preview hosting. Nexus's "publish this app" deploys *whatever the developer and their agents built in the sandbox*, behind a VPN-only private endpoint for internal staff. Same verb, different audience: one is a demo, the other is delivery.

**There is no integration.** A repository-wide search for "nexus" returns nothing. The Nexus paper specifies no intake mechanism — no spec import, no package format, no API from Pronghorn. The only stated handoff is that specifications "download cleanly and transfer directly to coding agents". Mechanically, the handoff between stages is a person carrying a file.

**The overlap is historical, not designed.** Pronghorn built a builder when its scope was end-to-end; the scope was then narrowed and build-and-deploy moved to Nexus. The build loop is residue of the wider scope.

One caveat, since it cuts the other way: the code is **not** being deprecated. There are no deprecation markers on the agent loop or the deploy path, specs 003, 005 and 006 are shipped work on exactly that plumbing, and the Build v2 plan says v1 and v2 "coexist indefinitely; cutover is a future decision", with the AI coding agent staying on v1. The accurate reading is that the build loop is no longer what Pronghorn is *for*, while remaining in the product and maintained.

**Practical consequences.** Adopting one gets you nothing toward the other — evaluate them as two decisions, on two clouds. Ignore the deploy button; it is a design-tool preview feature, not a deployment strategy. And the question Nexus raises is one we have regardless of any of this: *where do our agents execute, with what credentials, under what audit, and with what budget cap?* If developers are running agents on laptops against production credentials today, that is worth solving whether or not a spec factory ever ships. See [Agent execution environment](#agent-execution-environment) below.

---

## Verdict for an enterprise

The pattern is sound; the literal port is not. Alberta's fit is unusual: consistency over uniqueness, one tenant, one cloud, greenfield, many similar public services. Most enterprises have a legacy estate, mixed integration patterns, an existing SDLC with audit obligations, and demand for differentiated systems.

**Value**

- Stage gate against vibe-coding — design and security decided before codegen.
- Requirement → architecture → code → PR traceability. In a regulated environment this is the difference between "AI wrote it" being an audit finding and an audit answer.
- Standards compliance by construction rather than by review board. Scales; review boards do not.
- Genuine speed on front-loaded work — business cases, charters, requirement decomposition, options analysis.
- Specs are portable across coding agents, so you are not betting on one vendor.

**Constraints**

- The long tail of *operating* generated apps is the real cost, not building them. A factory without an ownership, funding and decommissioning model manufactures liabilities.
- Removing the dev-capacity throttle makes intake demand unbounded — explicit intake gating or you have industrialized shadow IT.
- No outcome metrics published. "Hundreds of vibe-coded prototypes" is not evidence. The platform is alpha and labelled as such.
- Heavy coupling: Azure Container Apps, APIM, Entra ID, PostgreSQL Flexible Server, AI Foundry, Terraform. Model coupling to Foundry GPT-4.1 / 4o / o3.
- Security review of generated code is mandatory and unsolved. SAST/DAST/dependency gates must be blocking, not advisory.
- IP and liability on generated output — MIT on the platform says nothing about what comes out of it.
- Small maintainer base. Treat a fork as code you now own.

---

## The building blocks

### 1. Standards as the moat

The agents are commodity and will be rewritten twice in eighteen months. The machine-readable standards library appreciates and is model-agnostic — it works with Pronghorn, Claude Code, Copilot, or humans. Start here regardless of whether anything else ships.

Each standard carries three layers:

1. **Normative statement** — what must be true, flat and declarative.
2. **Implementation guidance** — how to satisfy it *in our stack*, with a copyable reference snippet. This is what the agent imitates.
3. **Verification** — how a machine proves it (Semgrep / CodeQL rule, OPA/Conftest policy, contract test, CI check) or, explicitly marked, `manual`.

The automated-to-manual ratio is the honest maturity metric — report that rather than "number of standards published."

Record shape: git-backed, one file per standard, YAML frontmatter + markdown body. Git supplies versioning, review, blame and PR-based change control that a database table does not.

```yaml
id: SEC-AUTHZ-004
title: Every API endpoint enforces object-level authorization
status: active              # draft | active | deprecated | superseded
version: 2.1.0
applies_to:                 # the targeting selector — the critical field
  layers: [backend-api]
  stacks: [node-express, dotnet]
  data_class: [confidential, restricted]
  exempt_when: [public-unauthenticated-read]
severity: blocking          # blocking | required | recommended
owner: platform-security
supersedes: SEC-AUTHZ-003
verification:
  type: static-analysis
  rule: semgrep/rules/authz-object-check.yml
  ci_gate: security-scan
review_by: 2027-03-01
```

Body: normative statement, one-line rationale, a **correct example**, a **violating example**, known exemptions. The violating example matters more than expected — models pattern-match, and a labelled negative prevents a class of near-miss output.

Two fields carry most of the weight:

- **`applies_to`** — without precise targeting agents receive 300 standards and ignore all of them. Given this project's stack, layer and data classification, return the ~15 that bind.
- **`severity`** — `blocking` means CI fails. If everything is blocking, nothing is. Expect roughly 20 / 50 / 30 across blocking / required / recommended.

**Seed from the last 20 review findings and incidents, not from a taxonomy.** That gives standards with evidence behind them and makes the first release obviously useful rather than obviously bureaucratic. Cap the first release at 20–40 real standards.

Priority order: security baselines → data classification and handling → integration patterns → design system and accessibility → observability → tech stack allowlist.

Keeping it alive: every standard has a named owner and a `review_by` date (past date auto-opens a ticket, then drops to `recommended`); change goes through PR with the verification rule updated in the same PR; exemptions are recorded, time-boxed and attached to the project, never granted by silence. Build a **drift report** across the existing estate — it shows which standards are aspirational fiction and is usually the most persuasive artifact produced for leadership.

### 2. Context is persuasion, CI is enforcement

Standards reach agents three ways: retrieval at design time, a compiled rules file committed into each repo (`CLAUDE.md` / agent instructions), and a blocking gate at merge. Only the third actually holds. Never rely on the first two for anything `blocking`.

### 3. Brownfield — where the volume is, and where Pronghorn has nothing

`projects.github_repo` is a single text column: an output target, not an input. No repo import, no as-built analysis (`audit.ts` is 60 lines and compares datasets, not code).

The central conflict: **agents imitate surrounding code more strongly than they follow instructions.** Follow local idiom and you industrialize the propagation of existing defects; force standards and you get a hybrid codebase with two competing idioms, often worse to maintain. Resolve it by scoping the rule to the diff, not the repo.

**The ratchet** is the key mechanic. Run verification at onboarding, commit every violation to a **baseline file**, fail CI only on violations *not* in the baseline. New and modified code complies; existing code is grandfathered but frozen. The count goes down, never up.

Why it is the right answer:

- Onboarding becomes an afternoon, not a remediation programme.
- The baseline file *is* an accurate tech-debt register, which no manually curated one ever is.
- Remediation becomes a byproduct of normal work, and the most-touched files — the ones that matter — converge first.

This is proven ground: ESLint baselines, Sonar's new-code gate, typed-strictness migrations. It is simply rarely applied to architectural and security standards.

**Onboarding pipeline**

1. **Triage** — score on change frequency × business criticality. High/high gets full onboarding. Low-change/high-criticality gets verification and drift reporting only, no agent-assisted development. Low/low is skipped. Sunset candidates get nothing. Most programmes lose credibility onboarding fifty repos when eight mattered.
2. **Reverse-engineer the as-built spec** — architecture model (same node shape as the design canvas), inferred requirements, data map, integration inventory. All marked **`inferred`, never authoritative** until a human owner confirms. This is where AI genuinely earns its place in brownfield.
3. **Drift report** — violations by severity, the baseline file, and separately the handful of `blocking` findings that are live risk rather than style debt. An undifferentiated list of 900 findings loses the team immediately.
4. **Repo context file** — local idiom, the delta from standard and which side wins for new code, and the dragons (untested modules, the load-bearing hack, the thing that looks wrong and isn't). Only the team can write the third part; it is the highest-value content in the file.
5. **Characterization tests** — pin current behaviour, bugs included, without asserting it is correct. **Hard rule: no agent-assisted modification of untested code.** An agent editing untested legacy code produces a change nobody can verify.
6. **Waivers, time-boxed and owned** for accepted *risk* — distinct from the baseline, which is accepted *debt*. Keep the distinction or it erodes within a quarter.

**Do not run a mass "AI refactor to standards" campaign.** It is the most tempting move available and the most reliable way to kill the programme: enormous unreviewable diffs, subtle behaviour changes in code nobody understands, one production incident, and the factory becomes the thing that broke payments. The only exception is a narrow, mechanically verifiable, single-standard sweep with full test coverage, risk-assessed as its own change.

### 4. Central agents, per-repo context

Not bespoke agents per project — that distributes the standards library into N drifting copies and removes the ability to roll out a change centrally, which is the entire reason to do this centrally.

```
agent = shared role definition (implementer | reviewer | test-writer)
      + binding standards   (selected by stack / layer / data-class)
      + repo context file   (local idiom, delta, dragons)
      + as-built model      (this repo)
```

Only the last two are per-project, and they are **data, not agent code**. Update a standard once and every repo picks it up on the next run.

Success metric is **convergence, not uniformity**: violation count monotonically decreasing, new code compliant. Forty repos will not look alike, and chasing that turns into the doomed refactor campaign above. Five years of divergence stays in the cold parts of the codebase, correctly — touching it is pure risk with no return.

### 5. Multi-repo solutions

The unit of work is the **solution** — a set of repos with declared roles — not the repo. Pronghorn cannot express this.

```yaml
solution: claims-intake
repos:
  - url: org/claims-api
    role: service
    standards_layers: [backend-api, data]
  - url: org/claims-web
    role: frontend
  - url: org/claims-e2e
    role: acceptance-tests
    standards_layers: [test-automation]
    verifies: [claims-api, claims-web]
  - url: org/claims-infra
    role: infrastructure
    standards_layers: [iac, security-baseline]
contracts:
  - openapi: org/claims-api@spec/openapi.yaml
```

Baselines and ratchets stay **per repo** (they are about that codebase's debt); drift, health and the requirement tree roll up to **solution level**.

- **Role-based standard targeting is essential.** An e2e repo has no endpoints and must not be judged against API authorization standards. Judge it against test-automation standards — no sleeps, deterministic selectors, isolated data, no shared mutable fixtures, scenario naming. Most organizations have never written those down, and flaky e2e suites are usually the biggest single drag on deployment frequency.
- **Change-sets for cross-repo change.** One logical change, N pull requests, one identifier stamped on every branch and PR, a declared merge order, and a gate that will not call the set done until all members land. Default to backward-compatible first (additive API change merges, tests follow); breaking changes carry the expand/contract sequence. **Sequence, don't synchronize** — building true atomic multi-repo merge ends in a bespoke merge queue maintained forever.
- **Contracts cross the boundary, not source.** The agent working in the e2e repo gets the OpenAPI spec, event schemas and published fixtures — never the service's source. Context stays small, tests stay coupled to the interface, and the agent cannot reach into internals. Corollary: the contract must be a generated, versioned artifact of the service repo, with freshness as a blocking check. Add contract tests (Pact-style) so the repos verify compatibility without lockstep releases.
- **Traceability must be stamped, not inferred** — requirement ID in the Gherkin tag, the test name, the commit trailer and the PR. Make it a blocking lint rule in the e2e repo; otherwise the traceability story quietly stops at the repo boundary.

  ```gherkin
  @REQ-1042 @claims-intake
  Scenario: Partial claim submission is rejected with field-level errors
  ```

- **BDD ordering is an advantage here.** AC → Gherkin scenarios authored first → implementation against a failing scenario → done is machine-checkable. An agent implementing against a concrete failing test produces markedly better output than one implementing against prose, and reviewing generated scenarios is far cheaper than reviewing a generated implementation. **Hard rule: the implementing agent must never edit the scenarios** — it will make tests pass by changing them.
- **Ownership boundary.** An agent opens a PR against repos its team does not own; it never auto-merges. This is political more than technical, and getting it wrong is how the factory acquires enemies.
- **Ask whether the split should exist.** Different owners *and* different release cadences → keep it and build the change-set. Neither → merge the repos and delete the problem. One → decide case by case.

---

## Extend or replace Pronghorn?

**Neither wholesale — demote it.** Pronghorn becomes *one component* of the factory, not the platform.

| Piece | Call | Why |
| --- | --- | --- |
| Requirements hierarchy + architecture canvas | **Keep and extend** | Genuinely the well-developed part. Reuse the node model so greenfield and brownfield specs share a shape. |
| Standards library | **Replace** | The `standards` table is `code` / `title` / free-text `content` — no version, severity, `applies_to` or verification. Move to a git-backed system of record outside the app and let Pronghorn read it. |
| Requirements model | **Extend** | Authored-once today. Enhancements need versionable, amendable requirements. |
| Brownfield onboarding | **Build new** | Does not exist. As-built extraction, drift detection, ratchet, impact analysis — mostly *analysis* tooling, not generation. |
| Multi-repo / solution model | **Build new** | `github_repo` is one text column. Needs solution ↔ repos, roles and change-sets. |
| Build / deploy | **Don't adopt** | Its authors state in print that Nexus carries "the security controls and the agent observability that Pronghorn was never meant to carry." Hand spec bundles to the existing paved road instead. |
| Azure and model coupling | **Abstract** | Pinned to Foundry GPT-4.1 / 4o / o3 and Azure-specific infra. Add a provider layer before committing. |

Budget brownfield as its own build. It does not fall out of the greenfield pipeline.

---

## Agent execution environment

The one gap this assessment otherwise leaves open. Every route above assumes agents run somewhere, and says nothing about where.

The requirements are not exotic, and they are the same ones Nexus was built to meet: isolation per developer or per task; scoped, short-lived credentials rather than a developer's own; a full audit trail of what the agent read, wrote and ran; egress control and secret/PII filtering on the way out; and a hard budget cap per workspace. Whether that is a hosted sandbox, ephemeral cloud dev environments, or hardened local containers is a separate evaluation — but it is a prerequisite for letting agents touch anything real, and it is independent of whether we adopt Pronghorn at all.

Treat it as a parallel track to the sequencing below, not a phase within it. Phase 2 onward assumes it exists.

## Sequencing

1. **Standards library** — 20–40 standards drawn from real findings, verification rules wired into one pilot repo's CI. Roughly two weeks, and it pays off even if nothing else ships.
2. **Ratchet and drift report** on 3–5 brownfield repos. Reveals what fraction of the standards are actually automatable and what the real debt looks like.
3. **As-built extraction** — the highest-leverage new capability and where AI genuinely earns its place in brownfield.
4. **Greenfield design gate** via Pronghorn, handing spec bundles to existing CI/CD.
5. **Change-sets and the solution model** once multi-repo pain is concrete.

Set intake and decommissioning policy **before** switching anything on.

## Organization

One small owning team — two or three people spanning security, platform and architecture — owns the schema, the CI harness and the review process; domain experts author within it. Not a committee. The bottleneck in practice is never the writing, it is getting a decision when two groups disagree on what the standard is, so name a single accountable owner per category up front.

## The three risks to keep in front of you

1. Manufacturing applications nobody has funded to operate.
2. Industrializing shadow IT once the capacity throttle is gone.
3. One bad mass-refactor incident that makes the factory "the thing that broke payments."

---

## Why this is worth starting even if the factory never ships

Step 1 is low-cost, high-value and independent of the platform bet. Enforced, versioned, testable engineering standards work with Pronghorn, with any coding agent, and with humans. Most enterprises want that and few have it. That asymmetry is the whole argument for starting there.
