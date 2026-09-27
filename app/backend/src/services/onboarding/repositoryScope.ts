/**
 * Which repositories an organization may onboard (spec 007, epic B3; fix
 * round 3, item 6 — security).
 *
 * The platform has ONE GitHub App installation shared by every
 * organization, so "the installation can reach it" is not authorization.
 * An organization may only select — and the backend will only mint a
 * repository-scoped installation token for — a GitHub repository whose
 * owner is one of the logins in that organization's own `github_app`
 * integration connection scope (`scope.owners` / legacy `scope.owner`), the
 * same scope `GET /onboarding/github/repos` is filtered by. Likewise an
 * Azure Repos repository's `<adoOrg>` must be the Azure DevOps organization
 * of the connection PR opening will use for the run (the run's
 * `connection_id`, else the organization's default `azure_devops`
 * connection — exactly what `getAzureDevOpsClient` resolves).
 *
 * Checked at selection (`PUT /onboarding/runs/:id/repositories`) and again
 * right before any provider credential is used for the repository
 * (`openPullRequests` and `pullRequests.ts`), so a scope narrowed after
 * selection — or a row written by any other path — is still refused.
 *
 * Comparisons are case-insensitive: GitHub logins and Azure DevOps
 * organization names both are.
 */
import { getConnection, getDefaultConnectionForProvider } from "../integrations";
import { extractAzureDevOpsOrgLogin } from "../integrations/providers/azureDevOps";
import { inferRepositoryProvider, parseRepositoryFullName } from "../repositories/fullName";

interface GitHubConnectionScope {
  owner?: unknown;
  owners?: unknown;
}

/**
 * The GitHub owner logins (lowercased) an organization's `github_app`
 * connection is scoped to, or `[]` if none is configured — never derived
 * from anything the caller supplies.
 */
export async function getAllowedGitHubOwners(organizationId: string): Promise<string[]> {
  const connection = await getDefaultConnectionForProvider(organizationId, "github_app");
  const scope = (connection?.scope ?? {}) as GitHubConnectionScope;
  const raw: unknown[] = Array.isArray(scope.owners) && scope.owners.length > 0 ? scope.owners : scope.owner ? [scope.owner] : [];
  return Array.from(
    new Set(raw.filter((o): o is string => typeof o === "string" && o.trim().length > 0).map((o) => o.trim().toLowerCase()))
  );
}

/**
 * The Azure DevOps organization login (lowercased) of the connection PR
 * opening would use for this organization/run, or `null` if there is no
 * usable one (none configured, `connectionId` isn't an `azure_devops`
 * connection of this organization, or its URL has no recognizable org).
 */
export async function getAllowedAzureDevOpsOrg(organizationId: string, connectionId?: string | null): Promise<string | null> {
  let organizationUrl: unknown;
  try {
    const connection = await getConnection(organizationId, "azure_devops", connectionId ?? undefined);
    organizationUrl = (connection.scope as { organizationUrl?: unknown })?.organizationUrl;
  } catch {
    return null;
  }
  if (typeof organizationUrl !== "string") return null;
  return extractAzureDevOpsOrgLogin(organizationUrl)?.toLowerCase() ?? null;
}

export interface RepositoryScopeViolation {
  fullName: string;
  /** Safe to show to the caller: names only their own input and their own configuration. */
  reason: string;
}

/**
 * Checks every `fullName` against the organization's configured scope and
 * returns one violation per repository outside it (or with an unrecognized
 * shape), in input order — `[]` when all are in scope. Each provider's scope
 * is loaded at most once, and only if a repository of that provider is
 * present.
 */
export async function listRepositoriesOutsideOrgScope(
  organizationId: string,
  connectionId: string | null | undefined,
  fullNames: string[]
): Promise<RepositoryScopeViolation[]> {
  let githubOwners: string[] | undefined;
  let azureOrg: string | null | undefined;
  const violations: RepositoryScopeViolation[] = [];

  for (const fullName of fullNames) {
    const provider = inferRepositoryProvider(fullName);
    if (provider === "github") {
      githubOwners ??= await getAllowedGitHubOwners(organizationId);
      const { owner } = parseRepositoryFullName("github", fullName);
      if (!githubOwners.includes(owner.toLowerCase())) {
        violations.push({
          fullName,
          reason:
            githubOwners.length === 0
              ? "no GitHub connection is configured for this organization"
              : "its owner is not one of this organization's configured GitHub owners",
        });
      }
    } else if (provider === "azure_devops") {
      if (azureOrg === undefined) azureOrg = await getAllowedAzureDevOpsOrg(organizationId, connectionId);
      const { adoOrg } = parseRepositoryFullName("azure_devops", fullName);
      if (!azureOrg || adoOrg.toLowerCase() !== azureOrg) {
        violations.push({
          fullName,
          reason: !azureOrg
            ? "no usable Azure DevOps connection is configured for this run"
            : "it is not in this run's configured Azure DevOps organization",
        });
      }
    } else {
      violations.push({ fullName, reason: "unrecognized repository name" });
    }
  }
  return violations;
}

/** Thrown by {@link assertRepositoryInOrgScope}. */
export class RepositoryOutOfScopeError extends Error {
  constructor(public readonly violation: RepositoryScopeViolation) {
    super(`Repository "${violation.fullName}" is outside this organization's scope: ${violation.reason}`);
    this.name = "RepositoryOutOfScopeError";
  }
}

/** Throws {@link RepositoryOutOfScopeError} unless `fullName` is within the organization's scope. */
export async function assertRepositoryInOrgScope(
  organizationId: string,
  connectionId: string | null | undefined,
  fullName: string
): Promise<void> {
  const [violation] = await listRepositoriesOutsideOrgScope(organizationId, connectionId, [fullName]);
  if (violation) throw new RepositoryOutOfScopeError(violation);
}
