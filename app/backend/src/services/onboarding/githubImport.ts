/**
 * GitHub repository import for onboarding (spec 007, epic B3).
 *
 * Lists repositories the platform's GitHub App installation can see, so a
 * team can pick which ones to onboard (`GET /onboarding/github/repos`).
 * Read-only: uses the shared installation token from
 * {@link ../../utils/githubAppAuth}, never a repo-scoped one (those are only
 * minted right before opening a PR, see `pullRequests.ts`).
 */
import { getInstallationToken, isGitHubAppConfigured } from "../../utils/githubAppAuth";
import { logger } from "../../utils/logger";

export interface ImportableRepository {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  htmlUrl: string;
}

interface GitHubInstallationRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
  archived: boolean;
  html_url: string;
  owner: { login: string };
}

export interface ListGitHubRepositoriesOptions {
  /** Filter to repos owned by this org/login (defaults to all installation repos). */
  org?: string;
  /**
   * Filter to repos owned by any of these owners (fix round 2, item 8) — the
   * installation is paginated exactly once regardless of how many owners are
   * given, then filtered in memory. Takes precedence over `org` if both are
   * given.
   */
  owners?: string[];
  /** Case-insensitive substring match against `full_name`. */
  query?: string;
}

/**
 * Repositories visible to the platform's GitHub App installation. Paginates
 * through GitHub's `/installation/repositories` (max 100/page, once — fix
 * round 2, item 8: a multi-owner scope filters this single pass rather than
 * re-paginating per owner) and applies `owners`/`org`/`query` filtering
 * server-side so the frontend gets a plain list.
 */
export async function listGitHubRepositories(
  options: ListGitHubRepositoriesOptions = {}
): Promise<ImportableRepository[]> {
  if (!isGitHubAppConfigured()) {
    throw Object.assign(new Error("GitHub App is not configured"), { code: "GITHUB_APP_NOT_CONFIGURED" });
  }

  const token = await getInstallationToken();
  const repos: GitHubInstallationRepo[] = [];
  let page = 1;

  // Bounded loop: an installation with more than 20 pages (2000 repos) is
  // not expected for onboarding; stop rather than loop indefinitely.
  for (; page <= 20; page++) {
    const res = await fetch(
      `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      logger.error(`[onboarding/githubImport] list repositories failed: ${res.status} ${body.slice(0, 200)}`);
      throw Object.assign(new Error(`GitHub API returned ${res.status}`), { code: "GITHUB_API_ERROR" });
    }

    const data = (await res.json()) as { repositories: GitHubInstallationRepo[] };
    repos.push(...(data.repositories ?? []));

    if (!data.repositories || data.repositories.length < 100) break;
  }

  const owners = options.owners?.map((o) => o.trim().toLowerCase()).filter(Boolean);
  const org = options.org?.trim().toLowerCase();
  const query = options.query?.trim().toLowerCase();

  return repos
    .filter((r) => {
      const login = r.owner?.login?.toLowerCase();
      if (owners && owners.length > 0) return login !== undefined && owners.includes(login);
      return !org || login === org;
    })
    .filter((r) => !query || r.full_name.toLowerCase().includes(query))
    .map((r) => ({
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
      archived: r.archived,
      htmlUrl: r.html_url,
    }));
}
