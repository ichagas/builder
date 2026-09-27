/**
 * The ONE place a repository `full_name` is built or taken apart (spec 007,
 * data-model.md §2 `application_repositories.full_name`, §3
 * `onboarding_run_repositories.full_name`; contracts/api.md `POST /mesh/runs`).
 *
 * Convention (fix round 2, item 1; enforced here since fix round 3):
 *  - GitHub:        `<owner>/<repo>`             — exactly 2 segments
 *  - Azure Repos:   `<adoOrg>/<project>/<repo>`  — exactly 3 segments
 *
 * `adoOrg` is part of the name because `application_repositories.full_name`
 * is globally unique across providers AND tenants, and `<project>/<repo>`
 * alone collides across different Azure DevOps organizations. Since the two
 * shapes have different segment counts, the provider is recoverable from the
 * name alone ({@link inferRepositoryProvider}) — no other signal (e.g. the CI
 * system a sandbox run detected) is ever used to decide how to split one.
 *
 * Never `fullName.split("/")` anywhere else: a stale 2-segment Azure name, an
 * Azure name handed to GitHub code (or vice versa), or a crafted name with
 * extra/empty segments must fail loudly here instead of silently picking the
 * wrong segment (e.g. filing a work item against the ADO *organization* name
 * as if it were the project).
 *
 * This module has no imports so it can be used from `utils/` as well as
 * `services/`/`routes/` without creating dependency cycles.
 */

export type RepositoryProvider = "github" | "azure_devops";

export interface ParsedGitHubFullName {
  provider: "github";
  owner: string;
  repo: string;
  fullName: string;
}

export interface ParsedAzureFullName {
  provider: "azure_devops";
  adoOrg: string;
  project: string;
  repo: string;
  fullName: string;
}

export type ParsedRepositoryFullName = ParsedGitHubFullName | ParsedAzureFullName;

export class InvalidRepositoryFullNameError extends Error {
  constructor(
    public readonly provider: RepositoryProvider | null,
    public readonly fullName: unknown,
    reason: string
  ) {
    super(
      `Invalid ${provider === "azure_devops" ? "Azure DevOps " : provider === "github" ? "GitHub " : ""}repository full name ${JSON.stringify(
        typeof fullName === "string" ? fullName.slice(0, 300) : fullName
      )}: ${reason}`
    );
    this.name = "InvalidRepositoryFullNameError";
  }
}

// GitHub owner (user/org login). Slightly looser than the admin-scope login
// validator (githubApp.ts) because some legacy accounts predate the
// no-consecutive/trailing-hyphen rule, and these names come back from the
// GitHub API itself.
const GITHUB_OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
// GitHub repository names: ASCII letters, digits, `.`, `-`, `_`, max 100.
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
// Azure DevOps organization login — same character class the organization
// URL validator accepts (providers/azureDevOps.ts#validateOrganizationUrl).
const ADO_ORG_RE = /^[A-Za-z0-9._-]{1,50}$/;
// Characters Azure DevOps forbids in BOTH project and repository names
// (the intersection of the two documented lists), plus control characters.
// eslint-disable-next-line no-control-regex
const ADO_NAME_FORBIDDEN_RE = /[\\/:*?"'<>;#${},+=[\]|\u0000-\u001f\u007f-\u009f]/;
const ADO_NAME_MAX_LENGTH = 256;

function isDotSegment(segment: string): boolean {
  return segment === "." || segment === "..";
}

function validAdoName(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment.length <= ADO_NAME_MAX_LENGTH &&
    segment.trim() === segment &&
    !isDotSegment(segment) &&
    !ADO_NAME_FORBIDDEN_RE.test(segment)
  );
}

/** Expected segment count for `provider`'s full_name shape. */
export function expectedSegmentCount(provider: RepositoryProvider): 2 | 3 {
  return provider === "github" ? 2 : 3;
}

/**
 * Split and strictly validate `fullName` as `provider`'s shape. Throws
 * {@link InvalidRepositoryFullNameError} (never returns a partial result) on
 * the wrong number of segments, an empty/dot segment, or characters the
 * provider doesn't allow in that position.
 */
export function parseRepositoryFullName(provider: "github", fullName: unknown): ParsedGitHubFullName;
export function parseRepositoryFullName(provider: "azure_devops", fullName: unknown): ParsedAzureFullName;
export function parseRepositoryFullName(provider: RepositoryProvider, fullName: unknown): ParsedRepositoryFullName;
export function parseRepositoryFullName(provider: RepositoryProvider, fullName: unknown): ParsedRepositoryFullName {
  if (provider !== "github" && provider !== "azure_devops") {
    throw new InvalidRepositoryFullNameError(null, fullName, `unknown provider "${String(provider)}"`);
  }
  if (typeof fullName !== "string" || fullName.length === 0) {
    throw new InvalidRepositoryFullNameError(provider, fullName, "must be a non-empty string");
  }
  const segments = fullName.split("/");
  const expected = expectedSegmentCount(provider);
  if (segments.length !== expected) {
    throw new InvalidRepositoryFullNameError(
      provider,
      fullName,
      provider === "github" ? "expected \"<owner>/<repo>\"" : "expected \"<adoOrg>/<project>/<repo>\""
    );
  }

  if (provider === "github") {
    const [owner, repo] = segments;
    if (!GITHUB_OWNER_RE.test(owner)) {
      throw new InvalidRepositoryFullNameError(provider, fullName, "invalid owner");
    }
    if (!GITHUB_REPO_RE.test(repo) || isDotSegment(repo)) {
      throw new InvalidRepositoryFullNameError(provider, fullName, "invalid repository name");
    }
    return { provider, owner, repo, fullName };
  }

  const [adoOrg, project, repo] = segments;
  if (!ADO_ORG_RE.test(adoOrg) || isDotSegment(adoOrg)) {
    throw new InvalidRepositoryFullNameError(provider, fullName, "invalid Azure DevOps organization");
  }
  if (!validAdoName(project)) {
    throw new InvalidRepositoryFullNameError(provider, fullName, "invalid project name");
  }
  if (!validAdoName(repo)) {
    throw new InvalidRepositoryFullNameError(provider, fullName, "invalid repository name");
  }
  return { provider, adoOrg, project, repo, fullName };
}

/** Like {@link parseRepositoryFullName}, but `null` instead of throwing. */
export function tryParseRepositoryFullName(provider: RepositoryProvider, fullName: unknown): ParsedRepositoryFullName | null {
  try {
    return parseRepositoryFullName(provider, fullName);
  } catch (err) {
    if (err instanceof InvalidRepositoryFullNameError) return null;
    throw err;
  }
}

/**
 * The provider whose shape `fullName` validly has (2 segments → GitHub, 3 →
 * Azure Repos), or `null` if it is valid for neither.
 */
export function inferRepositoryProvider(fullName: unknown): RepositoryProvider | null {
  if (tryParseRepositoryFullName("github", fullName)) return "github";
  if (tryParseRepositoryFullName("azure_devops", fullName)) return "azure_devops";
  return null;
}

/** Parse `fullName` as whichever provider's shape it has; throws if neither. */
export function parseAnyRepositoryFullName(fullName: unknown): ParsedRepositoryFullName {
  const provider = inferRepositoryProvider(fullName);
  if (!provider) {
    throw new InvalidRepositoryFullNameError(
      null,
      fullName,
      "expected \"<owner>/<repo>\" (GitHub) or \"<adoOrg>/<project>/<repo>\" (Azure Repos)"
    );
  }
  return parseRepositoryFullName(provider, fullName);
}

/** Build (and validate) a GitHub full_name. */
export function formatGitHubFullName(owner: string, repo: string): string {
  return parseRepositoryFullName("github", `${owner}/${repo}`).fullName;
}

/** Build (and validate) an Azure Repos full_name. */
export function formatAzureFullName(adoOrg: string, project: string, repo: string): string {
  return parseRepositoryFullName("azure_devops", `${adoOrg}/${project}/${repo}`).fullName;
}
