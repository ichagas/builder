# Onboarding existing applications: three options

**Status:** Draft for decision · **Date:** 2026-09-25 · **Builds on:** Approach 3 (version timeline, Blueprint) in `LIFECYCLE.md` · **Compare:** open `compare-onboarding.html`

## The gap

Pronghorn covers greenfield delivery. A new application forks the base, inherits the agents structure and is governed from its first commit. **An application that already exists has no way in.** The lifecycle assumes an initiative that is starting, and nothing describes how a live application joins.

## What onboarding does (the same in all three options)

A **one-time process** for an existing application made of **one or more repositories**, on any stack (.NET, Java, Node, Python) and with any build method.

1. **Connect** the repositories. Pronghorn needs read access and permission to open pull requests.
2. **Run in a sandbox:** a read-only clone with egress blocked. Nothing is written to the repositories at this stage.
   1. **Review the code base.** Detect the stack, build and test commands, current CI, layers, and risks.
   2. **Create the AI agents** (`.github/`) from the standard template plus the repository's own context: `copilot-instructions.md`, `agents/` (code review, security, testing), `instructions/` per layer, `skills/` (build and test with the repo's real commands, dependency audit, Alberta rules, plain language), and tools (MCP config).
   3. **Create the Assurance Mesh:** a CI workflow that runs when a pull request is **merged into main**. It calls a shared reusable workflow, `goa-standards/assurance-mesh@v3`, with the four agents from *Velocity White Paper No. 07*:
      - **Green:** deterministic code quality and hygiene (dependencies, secrets, dangerous patterns, coverage).
      - **Yellow:** deterministic plain-language rules (12 of them) for UI copy, docs and messages to the public.
      - **Red:** reconnaissance of the **Test** environment, then proposed attack paths. It never scans production. Without a Test URL, Red is recorded as an exception.
      - **Blue:** runs last. It produces a threat model, checks the 285 OWASP ASVS L2 requirements and the 62 Alberta rules, and writes a ranked summary.
   4. **Record a baseline.** Existing findings become the baseline, and the mesh blocks **only new findings**. This is what makes onboarding safe for a live app: day one doesn't break the team's merges.
3. **Open one pull request per repository.** The team merges it in its own workflow. The first mesh run on main completes onboarding.

Every repository also gets **`pronghorn.standards.yml`**. It pins the Standards pack version, stack profile, build command and mesh policy, and it's what keeps the repository in sync.

**After onboarding, the team does not use the Builder for daily work.** They keep their IDE, their repos and their CI. Pronghorn's job becomes: publish new Standards packs, open **update pull requests** (which merge with local edits and never overwrite them), and collect the mesh reports as evidence.

## Option A: Connected project (`onboard-a-connected.html`)

**Idea:** an existing app is a Pronghorn project of type **Connected**, using **exactly the Approach 3 shell**. Only the meaning of the parts changes:

| Part of the shell | Built in Pronghorn | Connected project |
|---|---|---|
| Timeline | App versions | **Standards packs the app has adopted** |
| Flag | First release | **Onboarded** |
| Four phases | Define → Design → Build → Ship | **Review → Standards → Agents → Mesh**, the onboarding steps, repeated for every pack update |
| Released = read-only | Earlier app versions | Packs already adopted |

- **Onboarding** is the stretch before the flag. The Overview shows the repositories and a sandbox run with a live log. The rail's four steps light up as the run moves through them. Then **Open N pull requests** and, once merged, the flag is placed.
- **After onboarding:** a new pack appears on the timeline as an **Update** ("1/3 repos"). Its four steps show what changed in the code, what's new in the pack, which generated files change (with PR per repo), and the mesh results on main with the baseline counts.
- **Multiple repos and stacks:** repository tabs on every step, and a stack badge and mesh result on each repo row.
- **Good:** one pattern for greenfield and existing apps. The app's owners see governance where they already see projects.
- **Risk:** the same four phases now carry different labels, which needs care in the design. It also implies each existing app is a "project" that someone manages in Pronghorn.

## Option B: Assurance console (`onboard-b-console.html`)

**Idea:** connected apps are **not projects**. They live in one **organization-level console** next to the Standards Library, built for the people who own assurance across many teams.

- **Portfolio:** a grid of every app and repository showing stack, Standards version (with *behind* flagged), the four mesh agents on main, new findings versus baseline, and the ASVS L2 score.
- **Timeline = the evidence stream.** Merges to main, each with its mesh verdict. Selecting one opens its evidence: the four agents' results, plus a downloadable report.
- **Onboard an app** is a four-step wizard: Connect → Run in sandbox → Review output → Open pull requests. After merge, the app joins the portfolio.
- **Mesh policy** is set once for the organization (Block, Warn or Off per agent). Apps can tighten it but not loosen it.
- **Good:** scales to dozens of apps, is the natural home for security and assurance leads, and keeps the Builder free of apps it doesn't build.
- **Risk:** a second pattern (portfolio + wizard) alongside the Builder's rail. App teams may see it as oversight rather than help.

## Option C: Standards subscriptions (`onboard-c-registry.html`)

**Idea:** Pronghorn works like a **package registry for Standards**. A repository **subscribes** once. After that it is self-sufficient, and Pronghorn only publishes packs and proposes updates, the way dependency updates arrive.

- **Timeline = Standards pack releases**, each showing how many repositories pin it. Select a pack to see what's in it and who's on it or behind it, and send update pull requests in one click.
- **The four phases describe what a pack contains:** **Standards** (sources and checks), **Agents** (templates per stack profile), **Skills & tools**, and **Mesh** (the reusable workflow and policy). Each can be viewed per stack profile: .NET, Node, Java, Python.
- **Subscribe a repository** is a short dialog: pick repositories (stacks are detected), run the sandbox, and open PRs pinned to the latest pack.
- **The subscription lives in the repository** (`pronghorn.standards.yml`). If Pronghorn is unavailable, the agents and the mesh keep working. Sending reports back is optional.
- **Good:** lightest for teams, most "repo-native", and easiest to adopt for apps that will never be managed in Pronghorn.
- **Risk:** Pronghorn sees less about each app (no per-app page beyond its repositories), so evidence depends on repos choosing to report.

## Comparison

| | A · Connected project | B · Assurance console | C · Standards subscriptions |
|---|---|---|---|
| Unit | App (project) | App in a portfolio | Repository |
| Timeline shows | Packs adopted by this app | Merges to main (evidence) | Pack releases (org-wide) |
| Reuses the Approach 3 pattern | Fully | Partly (shell and timeline) | Mostly (timeline and 4 sections) |
| Multi-repo, multi-stack | Repo tabs per step | Portfolio grid rows | Per repo and per profile |
| Best for | App owners | Assurance and security leads | Development teams |
| Pronghorn needed day to day | Low | Low | None |
| Evidence and oversight | Per app | Strongest, org-wide | Optional reporting |
| Build effort | Medium | Medium | Low to medium |

## These options can be combined

They sit at three levels (app, organization, repository) and share one contract: **the manifest, the generated `.github`, and the reusable mesh workflow**. A likely end state:

- **C** is the mechanism: packs, the manifest, update PRs, the reusable workflow.
- **A** is how an app owner sees their app. It's the same shell as greenfield projects.
- **B** is the organization view for assurance leads, built later from the same mesh reports.

## Open questions for the decision

1. **Mesh on merge only, or also on pull requests?** On merge (as specified) reports what already landed. Adding an advisory run on the PR would catch findings before merge at little extra cost.
2. **What happens when the mesh finds something new on main?** Open an issue, block the next release, or notify only?
3. **Where does Red get a Test URL** for apps whose environments Pronghorn doesn't manage? Is the exception acceptable for internal-only services?
4. **Where does evidence live?** Pronghorn keeps it, the repository keeps it (artifacts), or both.
5. **Who approves exceptions,** and for how long?

## Note on implementation

`.github/copilot-instructions.md` marks the existing UI layout under `app/frontend/src/` as **non-negotiable without written client approval**. These prototypes live in `docs/design/` and are proposals. Implementing any of them, or the earlier shell redesign, needs that approval first.
