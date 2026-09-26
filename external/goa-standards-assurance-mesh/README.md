# goa-standards/assurance-mesh

The **Assurance Mesh**: a reusable CI workflow/template that runs the four
mesh agents — **Green, Yellow, Red, Blue** (*Velocity White Paper No. 07*) —
on every pull request to a repository's default branch, reports a signed
evidence report to Pronghorn, and applies a configurable policy outcome.

> **This directory is a staging copy.** It is built inside the Pronghorn
> monorepo (under `external/goa-standards-assurance-mesh/`) because this
> agent cannot create or push to the real, separate
> `goa-standards/assurance-mesh` repository. See "Publishing this repo" below
> for the exact steps a human needs to take. Everything under this directory
> is otherwise complete and independent of the monorepo — it has no
> dependency on `app/` and can be copied out as-is.

## What's here

| Path | Purpose |
|---|---|
| `.github/workflows/mesh.yml` | Reusable GitHub Actions workflow (`on: workflow_call`) |
| `templates/mesh.yml` | Azure Pipelines template (same stages/parameters) |
| `scripts/` | Shared Node.js logic both CIs call: report assembly, fingerprinting, signing, posting, policy evaluation. Unit tested with `node:test`. |
| `scripts/test-vectors/signature.json` | HMAC signature test vector for the Pronghorn API side (WP-BE4) to reuse |
| `packs/2026.3/` | A Standards pack: manifest + rules per agent, stack profiles (dotnet/node/java/python) |
| `examples/` | Sample caller workflow/pipeline and a sample `pronghorn.standards.yml` |

## How a repository uses it

Onboarding (or a human) drops one of the `examples/` files into the target
repository, pointing at this repo's `@v3` tag:

- **GitHub Actions**: `.github/workflows/assurance-mesh.yml` calls
  `goa-standards/assurance-mesh/.github/workflows/mesh.yml@v3` via
  `uses:`/`workflow_call`, triggered `on: pull_request` to the default
  branch.
- **Azure Pipelines**: `azure-pipelines/assurance-mesh.yml` (or
  `azure-pipelines.yml`) extends `templates/mesh.yml@assuranceMesh` (a
  `resources.repositories` reference to this repo at `refs/tags/v3`),
  triggered by the `pr:` branch policy on the default branch.

Both call the same `scripts/report-cli.js` for the report stage, so their
behavior — report shape, signing, policy — is identical.

## Stages

1. **Green** — code quality/hygiene: dependency vulnerabilities, license
   policy, secrets scan, dangerous patterns, test coverage, contract tests.
2. **Yellow** — the 12 deterministic plain-language rules for UI copy, docs
   and public-facing messages.
3. **Red** — reconnaissance of the Test environment (never production), then
   proposed attack paths. Without `test_environment_url`, Red is recorded as
   an exception (`mesh_exceptions`), not a failure.
4. **Blue** — runs last: threat model, the 285 OWASP ASVS L2 requirements,
   the 62 Alberta cybersecurity rules, a ranked summary.
5. **Cyber Risk sandbox** *(optional, per repository, `cyber_risk_sandbox:
   true`)* — deploys the PR build to an ephemeral sandbox, runs Red attack
   paths and Blue verification against it, tears it down. Never targets
   production.
6. **Report** — assembles the report, signs it, POSTs it to Pronghorn, then
   applies the policy outcome per check.

## The report contract

`scripts/lib/report.js` (`buildReport`) produces JSON matching `mesh_runs`
(spec `specs/007-frontend-new/data-model.md` §2):

```json
{
  "repository": "goa/permits-api",
  "commit_sha": "abc123def4567890abc123def4567890abcdef1",
  "pr_number": 214,
  "base_branch": "main",
  "pr_state": "open",
  "trigger": "pull_request",
  "pack_version": "2026.3",
  "verdicts": { "green": "pass", "yellow": "fail", "red": "pass", "blue": "pass" },
  "findings": [
    {
      "agent": "yellow",
      "rule": "plain-language-07",
      "file": "src/errors.ts",
      "location": "L42",
      "severity": "warn",
      "message": "Error message uses an internal code (E1043) instead of plain language.",
      "fingerprint": "fd83e152bb694b02eb3289a3614a152dab791e6884af75c7f461a9b64f4a4eb4"
    }
  ],
  "new_findings": 1,
  "asvs_passed": 280,
  "alberta_passed": 62,
  "report_url": "https://example.blob.core.windows.net/mesh-reports/permits-api/214/report.json",
  "received_at": "2026-09-25T12:00:00.000Z"
}
```

`repository` (a `full_name` string) is included so the API can resolve
`repository_id` via `application_repositories.full_name`; every other field
maps 1:1 onto a `mesh_runs` column. `findings[]` (not itself a `mesh_runs`
column) carries every finding this run produced, each tagged with a stable
`fingerprint` — `sha256(lowercase(agent|rule|file|location))`
(`scripts/lib/fingerprint.js`) — so the API can diff against
`mesh_baselines` (unique on `(repository_id, fingerprint)`) and persist any
new ones. `new_findings` here is this CI run's own (non-authoritative) count
against an empty local baseline view; the API's response is authoritative
(see below) since only it holds `mesh_baselines`.

### Signing

`POST <pronghorn_api_url>/api/v1/mesh/runs`, no user auth — a per-repository
HMAC key is the only authentication (`application_repositories.report_secret_ref`
resolves to the actual secret, provisioned as a CI secret: GitHub Actions
`secrets.report_hmac_key` input, Azure Pipelines the `reportHmacKeyVariable`
secret pipeline variable / variable group).

```
signature = hex(HMAC_SHA256(secret, raw_request_body))
header:  X-Pronghorn-Signature: sha256=<signature>
```

The signature is computed over the **exact bytes** sent as the body (no
re-serialization). `scripts/lib/sign.js` exports `sign()`/`verify()`; the
shared test vector at `scripts/test-vectors/signature.json` gives a
known-good `(secret, body, header_value)` triple for the Pronghorn API side
(WP-BE4) to verify its own implementation against.

### The API's expected response (for policy evaluation)

`report-cli.js` expects the ingest endpoint to respond (2xx) with the
authoritative new-findings counts, e.g.:

```json
{ "run_id": "…", "new_findings_by_agent": { "green": 0, "yellow": 1, "red": 0, "blue": 0 } }
```

If this shape isn't present, the CLI falls back to a naive local count (every
finding in the run counts as "new") with a warning — correct for a
first-ever run, but not for the ratchet in general. WP-BE4 should return
`new_findings_by_agent` from `POST /api/v1/mesh/runs`.

## Policy (`mesh_policy`, research.md D-15)

Per check (`green`, `yellow`, `red`, `blue`), a mode: `issue` (default, open
an issue/work item + notify), `notify` (notify only), `block` (fail the CI
job), or `off`. **The policy acts on new findings only** (research.md D-11) —
a pre-existing baseline finding resurfacing on a `fail` verdict does not by
itself trigger anything. `scripts/lib/policy.js` (`evaluatePolicy`)
implements this; `--policy-file` on `report-cli.js` supplies the modes (a
JSON file such as `{"blue": "block"}`, generated from `mesh_policy` /
`pronghorn.standards.yml`). Passed the string `--policy-source` in the
GitHub workflow / `policySource` in the Azure template, resolved from a path
in the caller repository (empty means every check defaults to `issue`).

## Standards packs and stack profiles

`packs/<version>/manifest.yml` lists the pack's agents and changes
(mirrors `standards_packs.changes` jsonb) plus `rules/<agent>.yml`, the
deterministic (Green, Yellow) or judgment-guiding (Red, Blue) rule
configuration for that pack version. `packs/<version>/profiles/<profile>.yml`
gives the build/test/scan tooling for one of `dotnet | node | java | python`.
A new profile or rule set ships as a new pack version directory —
`packs/2026.3/` never changes once published, so repositories pinned to it
keep reproducible behavior.

## Versioning

Tag releases `v3`, `v3.1`, … Callers pin the **major** tag
(`goa-standards/assurance-mesh@v3` / `refs/tags/v3`) so patch fixes to the
workflow/template/scripts roll out automatically, while a breaking change to
the report contract or job structure bumps to `v4` and callers upgrade
explicitly (onboarding-generated files reference the major tag; update PRs
bump it when Pronghorn decides to).

## Validating this repo

```sh
# YAML syntax
python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/workflows/mesh.yml
python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" templates/mesh.yml
python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" examples/.github/workflows/assurance-mesh.yml
python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" examples/azure-pipelines/assurance-mesh.yml

# actionlint (if Docker is available)
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint -color .github/workflows/mesh.yml

# script unit tests
cd scripts && npm test
```

## Publishing this repo (human steps, BLOCKED-EXTERNAL)

This agent cannot create repositories, push to remotes, or tag releases.
To go live:

1. Create the `goa-standards/assurance-mesh` repository (empty).
2. Copy the contents of this directory (`external/goa-standards-assurance-mesh/`,
   everything *except* this note) to the root of that new repository, and
   push it as the initial commit.
3. Tag that commit `v3` and push the tag (`git tag v3 && git push origin v3`).
4. Provision `PRONGHORN_REPORT_SECRET` (or equivalent) as a secret in the two
   sample caller repositories used to verify onboarding, matching each
   repository's `application_repositories.report_secret_ref` value in
   Pronghorn.
5. Run the sample GitHub Actions PR (`examples/.github/workflows/assurance-mesh.yml`)
   and the sample Azure Repos PR (`examples/azure-pipelines/assurance-mesh.yml`)
   against real (or sandboxed) repositories to confirm a signed report is
   accepted by `POST /api/v1/mesh/runs` and shows up in the portfolio.
