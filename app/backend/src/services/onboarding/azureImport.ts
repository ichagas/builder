/**
 * Azure Repos import for onboarding (spec 007, epic B3, fix round 1 item 5).
 *
 * Lists Git repositories across every Azure DevOps project the
 * organization's configured connection can see, so a team can pick which
 * ones to onboard (`GET /onboarding/azure/repos`). Read-only: uses
 * `services/integrations#getAzureDevOpsClient` (WP-BE8), which resolves the
 * organization's configured connection (or a specific `connectionId`) and
 * is itself org-scoped — a caller can never reach another organization's
 * Azure DevOps connection through this.
 *
 * `fullName` follows the same "<project>/<repo>" convention documented for
 * `application_repositories.full_name` (data-model.md §2) and consumed by
 * `pullRequests.ts#openAzureDevOpsPullRequest`.
 */
import { logger } from "../../utils/logger";
import { getAzureDevOpsClient } from "../integrations";

const AZURE_DEVOPS_API_VERSION = "7.1";

export interface ImportableAzureRepository {
  fullName: string;
  project: string;
  defaultBranch: string;
  disabled: boolean;
}

interface AzureProject {
  name: string;
}

interface AzureRepository {
  name: string;
  defaultBranch?: string;
  isDisabled?: boolean;
}

/**
 * Repositories visible to the organization's configured Azure DevOps
 * connection, across every project it can see. Azure DevOps has no single
 * "all repositories in the organization" endpoint, so this lists projects
 * first and then each project's repositories; a project whose repository
 * list can't be read (permissions) is skipped with a warning rather than
 * failing the whole call.
 */
export async function listAzureDevOpsRepositories(
  organizationId: string,
  connectionId: string | undefined,
  query?: string
): Promise<ImportableAzureRepository[]> {
  const client = await getAzureDevOpsClient(organizationId, connectionId);

  const projectsRes = await client.request(`/_apis/projects?api-version=${AZURE_DEVOPS_API_VERSION}`);
  if (!projectsRes.ok) {
    throw Object.assign(new Error(`Azure DevOps returned ${projectsRes.status} listing projects`), {
      code: "AZURE_DEVOPS_API_ERROR",
    });
  }
  const projectsData = (await projectsRes.json()) as { value: AzureProject[] };

  const results: ImportableAzureRepository[] = [];

  for (const project of projectsData.value ?? []) {
    const reposRes = await client.request(
      `/${encodeURIComponent(project.name)}/_apis/git/repositories?api-version=${AZURE_DEVOPS_API_VERSION}`
    );
    if (!reposRes.ok) {
      logger.warn(
        `[onboarding/azureImport] could not list repositories for project "${project.name}": ${reposRes.status}`
      );
      continue;
    }
    const reposData = (await reposRes.json()) as { value: AzureRepository[] };

    for (const repo of reposData.value ?? []) {
      results.push({
        fullName: `${project.name}/${repo.name}`,
        project: project.name,
        defaultBranch: (repo.defaultBranch || "refs/heads/main").replace(/^refs\/heads\//, ""),
        disabled: Boolean(repo.isDisabled),
      });
    }
  }

  const q = query?.trim().toLowerCase();
  return q ? results.filter((r) => r.fullName.toLowerCase().includes(q)) : results;
}
