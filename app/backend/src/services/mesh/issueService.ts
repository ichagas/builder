/**
 * Open a GitHub issue or Azure DevOps work item for a mesh run's new
 * findings (spec 007, WP-BE4, T125; research D-15).
 *
 * Called two ways:
 *  - Automatically from `routes/mesh.ts` on ingest, when the effective
 *    policy for an agent with new findings is `issue` (the default mode).
 *  - Manually via `POST /mesh/runs/:runId/issue` (evidence page "file an
 *    issue" action, or a retry after a transient provider failure).
 *
 * Both paths call {@link openIssueForNewFindings}, which is idempotent per
 * run: `mesh_runs.issue_opened_at` (migration 017) is checked first, so a
 * run never gets two issues.
 *
 * Azure DevOps: the actual connection (service connection or PAT, endpoint
 * URL) is configured on the Admin -> Integrations page (WP-BE8,
 * `integration_connections`, migration 016) and resolved through
 * `services/integrations`' `getAzureDevOpsClient(organizationId,
 * connectionId?)`. This module still takes a small injected
 * `AzureDevOpsClientProvider` interface — not to stand in for that work
 * (which is now merged), but so tests can inject a mock work-item client
 * without making real HTTP/Key Vault calls.
 */
import { logger } from "../../utils/logger";
import db from "../../utils/database";
import { getInstallationTokenForRepo, isGitHubAppConfigured } from "../../utils/githubAppAuth";
import { getAzureDevOpsClient } from "../integrations";
import { extractAzureDevOpsOrgLogin } from "../integrations/providers/azureDevOps";
import { parseRepositoryFullName } from "../repositories/fullName";
import { MeshFinding } from "./ingest";

export interface OpenIssueResult {
  /** Whether a new issue/work item was opened by this call (false = already existed, or provider unavailable). */
  created: boolean;
  issueRef: string | null;
  message?: string;
}

/** One finding formatted for an issue body, independent of provider. */
interface FindingsByAgent {
  agent: string;
  findings: MeshFinding[];
}

// ---------------------------------------------------------------------------
// Azure DevOps client (backed by services/integrations, WP-BE8)
// ---------------------------------------------------------------------------

export interface AzureDevOpsWorkItem {
  id: number;
  url: string;
}

/** Minimal surface this service needs from an Azure DevOps connection. */
export interface AzureDevOpsClient {
  /**
   * `adoOrg` is the Azure DevOps organization the repository's `full_name`
   * says it belongs to; an implementation must refuse to file the work item
   * through a connection for a different organization.
   */
  createWorkItem(input: { adoOrg: string; project: string; title: string; description: string }): Promise<AzureDevOpsWorkItem>;
}

/** Resolves the Azure DevOps client to use for a given organization/connection. */
export interface AzureDevOpsClientProvider {
  getClient(organizationId: string, connectionId?: string | null): Promise<AzureDevOpsClient | null>;
}

/**
 * Azure DevOps work items support many process templates (Basic, Agile,
 * Scrum, CMMI, …); "Task" is the one type present in every one of them, so
 * it's used here rather than "Issue" or "Bug" (missing from some templates).
 */
const AZURE_DEVOPS_WORK_ITEM_TYPE = "Task";
const AZURE_DEVOPS_API_VERSION = "7.1";

/**
 * Default provider: resolves the organization's (or a specific connection's)
 * Azure DevOps REST client via `services/integrations.getAzureDevOpsClient`
 * — the same connection resolution and secret handling used by onboarding
 * import and PR opening (WP-BE8, migration 016 `integration_connections`) —
 * and creates a work item with it using the "add JSON Patch" API.
 *
 * Returns `null` (rather than throwing) when no Azure DevOps connection is
 * configured for the organization, or it's a `service_connection` connection
 * (no Pronghorn-held credential to call the REST API with directly — see
 * `services/integrations/providers/azureDevOps.ts`): the caller treats that
 * the same as "provider not configured", not a hard failure of the run.
 */
class DefaultAzureDevOpsClientProvider implements AzureDevOpsClientProvider {
  async getClient(organizationId: string, connectionId?: string | null): Promise<AzureDevOpsClient | null> {
    let adoClient;
    try {
      adoClient = await getAzureDevOpsClient(organizationId, connectionId || undefined);
    } catch (err: any) {
      logger.warn(`[mesh-issue-service] No usable Azure DevOps connection for org ${organizationId}: ${err?.message}`);
      return null;
    }

    return {
      async createWorkItem({ adoOrg, project, title, description }): Promise<AzureDevOpsWorkItem> {
        // Same defense in depth as onboarding's PR opening: the connection
        // resolved for this organization must be for the Azure DevOps
        // organization the repository's full_name names — otherwise the
        // project segment would be resolved against the wrong ADO org.
        const clientOrg = extractAzureDevOpsOrgLogin(adoClient.organizationUrl);
        if (clientOrg && clientOrg.toLowerCase() !== adoOrg.toLowerCase()) {
          throw new Error(
            `Repository belongs to Azure DevOps organization "${adoOrg}", but the resolved connection is for "${clientOrg}"`,
          );
        }
        const patchDocument = [
          { op: "add", path: "/fields/System.Title", value: title },
          { op: "add", path: "/fields/System.Description", value: description },
        ];
        const res = await adoClient.request(
          `/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(
            AZURE_DEVOPS_WORK_ITEM_TYPE,
          )}?api-version=${AZURE_DEVOPS_API_VERSION}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json-patch+json" },
            body: JSON.stringify(patchDocument),
          },
        );
        if (!res.ok) {
          throw new Error(`Azure DevOps work item creation failed: ${res.status} ${await res.text()}`);
        }
        const data = (await res.json()) as { id: number; url: string; _links?: { html?: { href?: string } } };
        return { id: data.id, url: data._links?.html?.href || data.url };
      },
    };
  }
}

let azureDevOpsClientProvider: AzureDevOpsClientProvider = new DefaultAzureDevOpsClientProvider();

/** Test/DI hook: inject a mock Azure DevOps client provider. */
export function setAzureDevOpsClientProvider(provider: AzureDevOpsClientProvider): void {
  azureDevOpsClientProvider = provider;
}

/** Test-only: restore the default (services/integrations-backed) provider. */
export function resetAzureDevOpsClientProviderForTests(): void {
  azureDevOpsClientProvider = new DefaultAzureDevOpsClientProvider();
}

// ---------------------------------------------------------------------------
// GitHub issue creation (GitHub App installation token)
// ---------------------------------------------------------------------------

async function createGitHubIssue(fullName: string, title: string, body: string): Promise<{ number: number; htmlUrl: string } | null> {
  if (!isGitHubAppConfigured()) {
    logger.warn("[mesh-issue-service] GitHub App not configured; skipping issue creation");
    return null;
  }
  // Scoped to this one repository and the minimal permission needed (write
  // access to issues only) rather than the installation-wide token — a
  // compromised/buggy call here can't touch any other repository or
  // permission the platform's GitHub App happens to hold.
  const { owner, repo } = parseRepositoryFullName("github", fullName);
  const token = await getInstallationTokenForRepo({ fullName, permissions: { issues: "write" } });
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue creation failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { number: number; html_url: string };
  return { number: data.number, htmlUrl: data.html_url };
}

// ---------------------------------------------------------------------------
// Shared formatting
// ---------------------------------------------------------------------------

function groupByAgent(findings: MeshFinding[]): FindingsByAgent[] {
  const map = new Map<string, MeshFinding[]>();
  for (const finding of findings) {
    const list = map.get(finding.agent) || [];
    list.push(finding);
    map.set(finding.agent, list);
  }
  return [...map.entries()].map(([agent, list]) => ({ agent, findings: list }));
}

/**
 * Findings, and other fields taken from the ingested CI report (`pack_version`
 * in particular — see `routes/mesh.ts`, only checked to be a non-empty
 * string), are untrusted input as far as this service is concerned: a
 * compromised repository secret, or a bug on the CI side, could put anything
 * in `rule`/`file`/`location`/`message`/`pack_version`. Escape every ASCII
 * punctuation character CommonMark treats as escapable (the same set GitHub
 * Flavored Markdown honors) before such text goes into an issue title or
 * body, so it can't:
 *  - break out of a list item, heading, bold/italic span, or fenced/backtick
 *    code (`` * _ ` # ~ ``),
 *  - open a fake link/image or raw HTML tag (`[ ] ( ) < >`),
 *  - or read as an `@user`/`@org/team` mention, which GitHub notifies on
 *    even from an issue a bot filed (`@`).
 */
export function escapeMarkdown(value: string): string {
  return value.replace(/[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/g, (ch) => `\\${ch}`);
}

function formatIssueBody(runId: string, packVersion: string, reportUrl: string, groups: FindingsByAgent[]): string {
  const lines: string[] = [
    `The Assurance Mesh found new findings on run \`${runId}\` (pack ${escapeMarkdown(packVersion)}).`,
    "",
    `Full evidence: ${reportUrl}`,
    "",
  ];
  for (const group of groups) {
    lines.push(`### ${escapeMarkdown(group.agent)}`, "");
    for (const finding of group.findings) {
      const location = [finding.file, finding.location].filter(Boolean).join(":");
      const rule = escapeMarkdown(finding.rule || "");
      const message = escapeMarkdown(finding.message || "see report");
      lines.push(`- **${rule}**${location ? ` (${escapeMarkdown(location)})` : ""}: ${message}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Open an issue (GitHub) or work item (Azure DevOps) covering a run's new
 * findings. Idempotent: if `mesh_runs.issue_opened_at` is already set, this
 * is a no-op that returns the existing reference.
 *
 * This only opens ONE issue per run (covering every agent with new
 * findings), not one per agent — simplest reading consistent with the spec,
 * which describes "open a GitHub issue... for new findings" per run.
 */
export async function openIssueForNewFindings(runId: string): Promise<OpenIssueResult> {
  const { rows } = await db.query(
    `SELECT mr.id, mr.pack_version, mr.report_url, mr.new_findings, mr.issue_ref, mr.issue_opened_at,
            ar.full_name, ar.provider, ar.connection_id, a.team_id, t.organization_id
     FROM public.mesh_runs mr
     JOIN public.application_repositories ar ON ar.id = mr.repository_id
     JOIN public.applications a ON a.id = ar.application_id
     JOIN public.teams t ON t.id = a.team_id
     WHERE mr.id = $1`,
    [runId],
  );
  const run = rows[0];
  if (!run) {
    return { created: false, issueRef: null, message: "Run not found" };
  }
  if (run.issue_opened_at) {
    return { created: false, issueRef: run.issue_ref, message: "Issue already opened for this run" };
  }
  if (!run.new_findings || run.new_findings === 0) {
    return { created: false, issueRef: null, message: "No new findings on this run" };
  }

  // Findings themselves are not persisted beyond mesh_baselines (only
  // fingerprints); the full finding detail lives in the report blob. This
  // service links out to it rather than re-fetching/parsing that blob here.
  const groups: FindingsByAgent[] = [];
  // `run.full_name` is set by an org admin linking the repository, not by
  // the ingested report, but it's escaped here too as defense in depth since
  // it still ends up in Markdown text a viewer's client will render.
  const displayName = escapeMarkdown(run.full_name);
  const title = `Assurance Mesh: ${run.new_findings} new finding${run.new_findings === 1 ? "" : "s"} (${displayName})`;
  const body = groups.length
    ? formatIssueBody(runId, run.pack_version, run.report_url, groups)
    : `The Assurance Mesh found ${run.new_findings} new finding(s) on run \`${runId}\`.\n\nFull evidence: ${run.report_url}`;

  let issueRef: string | null = null;
  try {
    if (run.provider === "github") {
      const issue = await createGitHubIssue(run.full_name, title, body);
      if (issue) issueRef = `github:${run.full_name}#${issue.number}`;
    } else if (run.provider === "azure_devops") {
      // `full_name` is "<adoOrg>/<project>/<repo>" for Azure Repos
      // (data-model.md §2); the work item is filed against the project.
      // Parsed strictly (services/repositories/fullName) so a malformed or
      // stale name fails here instead of filing against the wrong segment.
      const { adoOrg, project } = parseRepositoryFullName("azure_devops", run.full_name);
      const client = await azureDevOpsClientProvider.getClient(run.organization_id, run.connection_id);
      if (client) {
        const workItem = await client.createWorkItem({ adoOrg, project, title, description: body });
        issueRef = `azure_devops:${run.full_name}#${workItem.id}`;
      }
    }
  } catch (err: any) {
    logger.error(`[mesh-issue-service] Failed to open issue for run ${runId}: ${err?.message}`);
    return { created: false, issueRef: null, message: err?.message || "Issue creation failed" };
  }

  if (!issueRef) {
    return { created: false, issueRef: null, message: "Provider not configured; no issue opened" };
  }

  await db.query(`UPDATE public.mesh_runs SET issue_ref = $1, issue_opened_at = now() WHERE id = $2`, [issueRef, runId]);

  return { created: true, issueRef };
}
