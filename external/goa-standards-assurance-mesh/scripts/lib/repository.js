'use strict';

/**
 * The `repository` field of a mesh report is the repository's canonical
 * Pronghorn `full_name` (application_repositories.full_name, spec 007
 * data-model.md §2) — the ingest API (`POST /api/v1/mesh/runs`) does an
 * EXACT lookup on it and never normalizes, so the CI side must send exactly:
 *
 *   - GitHub:       "<owner>/<repo>"              (GitHub Actions `github.repository`,
 *                                                  or Azure Pipelines building a GitHub repo)
 *   - Azure Repos:  "<adoOrg>/<project>/<repo>"   (Azure Pipelines building an Azure Repos
 *                                                  (TfsGit) repo — `Build.Repository.Name`
 *                                                  alone is only "<repo>")
 *
 * This mirrors app/backend/src/services/repositories/fullName.ts on the API
 * side (kept dependency-free here; see README.md "The report contract").
 */

// Build.Repository.Provider values for an Azure Repos Git repository.
const AZURE_REPOS_PROVIDERS = new Set(['tfsgit']);

/**
 * The Azure DevOps organization login from `System.CollectionUri`:
 * `https://dev.azure.com/<org>/` or `https://<org>.visualstudio.com/[<collection>/]`.
 * Throws if it is neither.
 */
function azureOrgFromCollectionUri(collectionUri) {
  let url;
  try {
    url = new URL(String(collectionUri || ''));
  } catch {
    throw new Error(`Cannot derive the Azure DevOps organization from collection URI "${collectionUri}"`);
  }
  if (url.hostname.toLowerCase() === 'dev.azure.com') {
    const [org] = url.pathname.split('/').filter(Boolean);
    if (org) return decodeURIComponent(org);
  }
  const vs = /^([A-Za-z0-9-]+)\.visualstudio\.com$/i.exec(url.hostname);
  if (vs) return vs[1];
  throw new Error(`Cannot derive the Azure DevOps organization from collection URI "${collectionUri}"`);
}

function assertSegment(label, value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('/') || value !== value.trim()) {
    throw new Error(`Invalid ${label} for the repository full name: ${JSON.stringify(value)}`);
  }
}

/** "<adoOrg>/<project>/<repo>" for an Azure Repos repository. */
function azureRepositoryFullName({ collectionUri, project, repository }) {
  const adoOrg = azureOrgFromCollectionUri(collectionUri);
  assertSegment('Azure DevOps organization', adoOrg);
  assertSegment('Azure DevOps project', project);
  assertSegment('repository name', repository);
  return `${adoOrg}/${project}/${repository}`;
}

/**
 * Resolve the report's `repository` from CLI args:
 *  - `--repository-provider TfsGit` (Azure Repos): requires
 *    `--azure-collection-uri` and `--azure-project`; `--repository` is the
 *    bare repo name.
 *  - anything else (GitHub): `--repository` must already be "<owner>/<repo>".
 */
function resolveRepositoryFullName(args) {
  const provider = String(args['repository-provider'] || '').toLowerCase();
  if (AZURE_REPOS_PROVIDERS.has(provider)) {
    return azureRepositoryFullName({
      collectionUri: args['azure-collection-uri'],
      project: args['azure-project'],
      repository: args.repository,
    });
  }
  const segments = String(args.repository || '').split('/');
  if (segments.length !== 2 || segments.some((s) => !s)) {
    throw new Error(
      `--repository must be "<owner>/<repo>" for a GitHub repository (got ${JSON.stringify(args.repository)}); ` +
        'for Azure Repos pass --repository-provider TfsGit with --azure-collection-uri and --azure-project',
    );
  }
  return args.repository;
}

module.exports = { azureOrgFromCollectionUri, azureRepositoryFullName, resolveRepositoryFullName };
