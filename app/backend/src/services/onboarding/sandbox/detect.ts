/**
 * CI-provider and stack-profile detection for the onboarding sandbox
 * (spec 007, epic B3, WP-BE6, T141; research D-12).
 *
 * Shared by {@link ../jobDispatcher.LocalJobDispatcher}'s fixture-backed test
 * runner (runs this in-process against a test fixture directory) and
 * `infra/onboarding-sandbox/` (the real sandbox image): this file and
 * `generateManifest.ts` have no dependency on anything else in
 * `app/backend` (no DB, no Express, no Azure SDKs), so the sandbox image's
 * Dockerfile `COPY`s them straight from this directory at build time (build
 * context is the repo root — see `infra/onboarding-sandbox/Dockerfile`) and
 * compiles them alongside its own small entrypoint. One file, one behavior,
 * both sides of the boundary.
 *
 * Detection only ever reads a list of relative file paths present in the
 * repository (never file contents) — it's a fast, dependency-free heuristic,
 * not a build-system parser.
 */
/**
 * Canonical home of this type (moved here, from `../jobDispatcher`, so this
 * file has zero dependency on anything else in `app/backend` — see the
 * module docstring above). `jobDispatcher.ts` re-exports it for every
 * existing caller.
 */
export type DetectedCiProvider = "github_actions" | "azure_pipelines";

export type RepositoryHost = "github" | "azure_devops";
export type StackProfile = "dotnet" | "node" | "java" | "python";

export interface DetectedStack {
  profile: StackProfile;
  stackLabel: string;
  buildCommand: string;
}

/**
 * GitHub Actions: any workflow file under `.github/workflows/`. Azure
 * Pipelines: a top-level `azure-pipelines.yml` (or `azure-pipelines-*.yml`)
 * or anything under `.azure-pipelines/`. Falls back to the repository's own
 * host (research D-12: "fall back to the repo's host") when neither is
 * present.
 */
export function detectCiProvider(files: string[], host: RepositoryHost): DetectedCiProvider {
  const hasGitHubActions = files.some((f) => f.startsWith(".github/workflows/"));
  if (hasGitHubActions) return "github_actions";

  const hasAzurePipelines = files.some(
    (f) => f.startsWith(".azure-pipelines/") || /^azure-pipelines(-[\w.-]+)?\.ya?ml$/i.test(f)
  );
  if (hasAzurePipelines) return "azure_pipelines";

  return host === "azure_devops" ? "azure_pipelines" : "github_actions";
}

interface StackRule {
  profile: StackProfile;
  stackLabel: string;
  buildCommand: string;
  matches: (files: string[]) => boolean;
}

// Checked in order; the first match wins. A repository with markers for more
// than one stack (e.g. a Node front end alongside a .NET API) is common —
// onboarding registers one profile per *repository*, not per component, so
// this is deliberately a simple, ordered heuristic rather an attempt at
// perfect classification. `part.md`/manual review (contracts/api.md
// `onboarding_run_repositories.review`) is where a human corrects it.
const STACK_RULES: StackRule[] = [
  {
    profile: "dotnet",
    stackLabel: ".NET",
    buildCommand: "dotnet build --configuration Release && dotnet test --configuration Release",
    matches: (files) => files.some((f) => /\.(csproj|sln|fsproj)$/i.test(f)),
  },
  {
    profile: "java",
    stackLabel: "Java",
    buildCommand: "mvn -B verify",
    matches: (files) => files.some((f) => /(^|\/)pom\.xml$/i.test(f)),
  },
  {
    profile: "java",
    stackLabel: "Java (Gradle)",
    buildCommand: "./gradlew build",
    matches: (files) => files.some((f) => /(^|\/)build\.gradle(\.kts)?$/i.test(f)),
  },
  {
    profile: "python",
    stackLabel: "Python",
    buildCommand: "pip install -r requirements.txt && pytest",
    matches: (files) => files.some((f) => /(^|\/)(requirements\.txt|pyproject\.toml|setup\.py)$/i.test(f)),
  },
  {
    profile: "node",
    stackLabel: "Node.js",
    buildCommand: "npm ci && npm run build && npm test",
    matches: (files) => files.some((f) => /(^|\/)package\.json$/i.test(f)),
  },
];

/**
 * Best-effort stack detection from a repository's file list. Falls back to
 * `node` with a placeholder build command (never throws, never leaves
 * `profile` empty — `application_repositories.profile` is NOT NULL) when
 * nothing matches, so a repository the sandbox can't classify still reaches
 * the review step for a human to correct.
 */
export function detectStack(files: string[]): DetectedStack {
  for (const rule of STACK_RULES) {
    if (rule.matches(files)) {
      return { profile: rule.profile, stackLabel: rule.stackLabel, buildCommand: rule.buildCommand };
    }
  }
  return {
    profile: "node",
    stackLabel: "Unknown (no recognized manifest — defaulted, review before merging)",
    buildCommand: "echo 'no build command detected; set one in review before merging'",
  };
}
