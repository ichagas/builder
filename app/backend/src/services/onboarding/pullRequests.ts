/**
 * Opening the onboarding pull request for one repository (spec 007, epic
 * B3). Called only from `services/onboarding/index.ts#openPullRequests`,
 * itself only reachable after the caller has confirmed and the run's status
 * is `ready`/`prs_open` — this module does no confirmation or state-machine
 * enforcement of its own, it only knows how to open one PR.
 *
 * GitHub: mints a token scoped to the single target repository via
 * `utils/githubAppAuth#getInstallationTokenForRepo` (shared with WP-BE4's
 * mesh issue/update-PR services — do not reimplement this locally) so a
 * failure or bug here cannot touch any other repository, even though the
 * platform installation may span many. This is intentionally a fresh,
 * short-lived token per call — never the shared, broadly-scoped token from
 * `getInstallationToken`.
 *
 * Azure DevOps: uses the organization's configured connection
 * (`services/integrations#getAzureDevOpsClient`), which is PAT-scoped to
 * whatever projects/repos the admin granted it.
 */
import { logger } from "../../utils/logger";
import { getInstallationTokenForRepo } from "../../utils/githubAppAuth";
import { getAzureDevOpsClient } from "../integrations";
import { extractAzureDevOpsOrgLogin } from "../integrations/providers/azureDevOps";
import { parseRepositoryFullName } from "../repositories/fullName";
import { GeneratedFile } from "./jobDispatcher";

export interface OpenPullRequestInput {
  provider: "github" | "azure_devops";
  fullName: string;
  organizationId: string;
  connectionId?: string | null;
  branchName: string;
  title: string;
  body: string;
  files: GeneratedFile[];
}

export interface OpenPullRequestResult {
  prNumber: number;
  prState: "open";
  /** The repository's default branch, as read from the provider (fix round 1, item 3). */
  defaultBranch: string;
}

async function githubRequest(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`https://api.github.com${path}`, { ...init, headers });
}

async function openGitHubPullRequest(input: OpenPullRequestInput): Promise<OpenPullRequestResult> {
  const { owner, repo } = parseRepositoryFullName("github", input.fullName);

  const token = await getInstallationTokenForRepo({
    fullName: input.fullName,
    permissions: { contents: "write", pull_requests: "write" },
  });

  const repoRes = await githubRequest(token, `/repos/${owner}/${repo}`);
  if (!repoRes.ok) throw new Error(`Could not read ${owner}/${repo}: ${repoRes.status}`);
  const repoData = (await repoRes.json()) as { default_branch: string };
  const defaultBranch = repoData.default_branch;

  const refRes = await githubRequest(token, `/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`);
  if (!refRes.ok) throw new Error(`Could not read default branch ref for ${owner}/${repo}: ${refRes.status}`);
  const refData = (await refRes.json()) as { object: { sha: string } };
  const baseSha = refData.object.sha;

  const createRefRes = await githubRequest(token, `/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${input.branchName}`, sha: baseSha }),
  });
  if (!createRefRes.ok && createRefRes.status !== 422) {
    // 422 == ref already exists (retry after a partial failure) — proceed.
    throw new Error(`Could not create branch for ${owner}/${repo}: ${createRefRes.status}`);
  }

  for (const file of input.files) {
    let sha: string | undefined;
    const existingRes = await githubRequest(
      token,
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}?ref=${encodeURIComponent(input.branchName)}`
    );
    if (existingRes.ok) {
      const existing = (await existingRes.json()) as { sha: string };
      sha = existing.sha;
    }

    const putRes = await githubRequest(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Onboard: add ${file.path}`,
        content: Buffer.from(file.content, "utf8").toString("base64"),
        branch: input.branchName,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      throw new Error(`Could not write ${file.path} to ${owner}/${repo}: ${putRes.status}`);
    }
  }

  // Idempotent: if a PR from this branch is already open, reuse it instead
  // of erroring (retry after a partial failure elsewhere in the run).
  const existingPrRes = await githubRequest(
    token,
    `/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(`${owner}:${input.branchName}`)}&state=open`
  );
  if (existingPrRes.ok) {
    const existingPrs = (await existingPrRes.json()) as Array<{ number: number }>;
    if (existingPrs.length > 0) {
      return { prNumber: existingPrs[0].number, prState: "open", defaultBranch };
    }
  }

  const prRes = await githubRequest(token, `/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.branchName,
      base: defaultBranch,
    }),
  });
  if (!prRes.ok) {
    const text = await prRes.text();
    throw new Error(`Could not open PR for ${owner}/${repo}: ${prRes.status} ${text.slice(0, 200)}`);
  }
  const prData = (await prRes.json()) as { number: number };
  return { prNumber: prData.number, prState: "open", defaultBranch };
}

async function openAzureDevOpsPullRequest(input: OpenPullRequestInput): Promise<OpenPullRequestResult> {
  // Convention (fix round 2, item 1): an Azure DevOps repository's full_name
  // is `<adoOrg>/<project>/<repo>` — `<project>/<repo>` alone isn't globally
  // unique across different Azure DevOps organizations, and
  // `application_repositories.full_name` is (see data-model.md §2). Parsed
  // strictly by the shared parser (services/repositories/fullName).
  const { adoOrg, project, repo: repoName } = parseRepositoryFullName("azure_devops", input.fullName);

  const client = await getAzureDevOpsClient(input.organizationId, input.connectionId ?? undefined);

  // Defense in depth: the connection resolved for this organization must
  // actually be for the Azure DevOps organization the repository's
  // full_name says it belongs to — catches stale full_names left over from
  // a connection that was reconfigured to point at a different ADO org.
  const clientOrg = extractAzureDevOpsOrgLogin(client.organizationUrl);
  if (clientOrg && clientOrg.toLowerCase() !== adoOrg.toLowerCase()) {
    throw new Error(
      `Repository "${input.fullName}" belongs to Azure DevOps organization "${adoOrg}", but the resolved connection is for "${clientOrg}"`
    );
  }

  const repoRes = await client.request(`/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoName)}?api-version=7.1`);
  if (!repoRes.ok) throw new Error(`Could not read Azure Repos repository ${input.fullName}: ${repoRes.status}`);
  const repoData = (await repoRes.json()) as { id: string; defaultBranch: string };
  const repositoryId = repoData.id;
  const defaultBranch = repoData.defaultBranch || "refs/heads/main";

  // Idempotent: reuse an already-open PR from this source branch, if any.
  const existingRes = await client.request(
    `/${encodeURIComponent(project)}/_apis/git/repositories/${repositoryId}/pullrequests?searchCriteria.sourceRefName=${encodeURIComponent(
      `refs/heads/${input.branchName}`
    )}&searchCriteria.status=active&api-version=7.1`
  );
  if (existingRes.ok) {
    const existing = (await existingRes.json()) as { value: Array<{ pullRequestId: number }> };
    if (existing.value?.length > 0) {
      return { prNumber: existing.value[0].pullRequestId, prState: "open", defaultBranch: defaultBranch.replace(/^refs\/heads\//, "") };
    }
  }

  const baseRefRes = await client.request(
    `/${encodeURIComponent(project)}/_apis/git/repositories/${repositoryId}/refs?filter=${encodeURIComponent(
      defaultBranch.replace("refs/", "")
    )}&api-version=7.1`
  );
  if (!baseRefRes.ok) throw new Error(`Could not read default branch ref for ${input.fullName}: ${baseRefRes.status}`);
  const baseRefData = (await baseRefRes.json()) as { value: Array<{ objectId: string }> };
  const oldObjectId = baseRefData.value?.[0]?.objectId;
  if (!oldObjectId) throw new Error(`Default branch not found for ${input.fullName}`);

  const pushRes = await client.request(`/${encodeURIComponent(project)}/_apis/git/repositories/${repositoryId}/pushes?api-version=7.1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refUpdates: [{ name: `refs/heads/${input.branchName}`, oldObjectId }],
      commits: [
        {
          comment: "Onboard: add assurance-mesh CI",
          changes: input.files.map((file) => ({
            changeType: "add",
            item: { path: `/${file.path}` },
            newContent: { content: file.content, contentType: "rawtext" },
          })),
        },
      ],
    }),
  });
  if (!pushRes.ok && pushRes.status !== 409) {
    // 409 == branch/commit already exists (retry after a partial failure).
    const text = await pushRes.text();
    throw new Error(`Could not push onboarding branch for ${input.fullName}: ${pushRes.status} ${text.slice(0, 200)}`);
  }

  const prRes = await client.request(`/${encodeURIComponent(project)}/_apis/git/repositories/${repositoryId}/pullrequests?api-version=7.1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceRefName: `refs/heads/${input.branchName}`,
      targetRefName: defaultBranch,
      title: input.title,
      description: input.body,
    }),
  });
  if (!prRes.ok) {
    const text = await prRes.text();
    throw new Error(`Could not open PR for ${input.fullName}: ${prRes.status} ${text.slice(0, 200)}`);
  }
  const prData = (await prRes.json()) as { pullRequestId: number };
  return { prNumber: prData.pullRequestId, prState: "open", defaultBranch: defaultBranch.replace(/^refs\/heads\//, "") };
}

/** Open (or reuse an already-open) pull request for one onboarding repository. */
export async function openRepositoryPullRequest(input: OpenPullRequestInput): Promise<OpenPullRequestResult> {
  logger.info(`[onboarding/pullRequests] opening PR for ${input.fullName} via ${input.provider}`);
  if (input.provider === "github") return openGitHubPullRequest(input);
  return openAzureDevOpsPullRequest(input);
}
