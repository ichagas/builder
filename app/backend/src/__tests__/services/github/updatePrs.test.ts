/**
 * Unit tests for services/github/updatePrs.ts (spec 007, WP-BE4, T123).
 */
import { openUpdatePr, bumpPackVersion, bumpWorkflowRef, RepoToUpdate } from "../../../services/github/updatePrs";

jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockIsGitHubAppConfigured = jest.fn();
const mockGetInstallationToken = jest.fn();
jest.mock("../../../utils/githubAppAuth", () => ({
  isGitHubAppConfigured: () => mockIsGitHubAppConfigured(),
  getInstallationToken: () => mockGetInstallationToken(),
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

const MANIFEST_CONTENT = [
  "# local comment kept as-is",
  "pronghorn:",
  '  repository: goa/permits-api',
  '  pack_version: "2026.2" # pin',
  "  profile: dotnet",
  "  build_command: \"dotnet build && dotnet test\" # custom local edit",
].join("\n");

const WORKFLOW_CONTENT = [
  "name: Assurance Mesh",
  "on:",
  "  pull_request:",
  "    branches: [main]",
  "jobs:",
  "  mesh:",
  "    uses: goa-standards/assurance-mesh/.github/workflows/mesh.yml@v3",
  "    with:",
  '      pack_version: "2026.2"',
  '      mesh_scripts_ref: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
].join("\n");

function repo(overrides: Partial<RepoToUpdate> = {}): RepoToUpdate {
  return {
    id: "repo-1",
    fullName: "goa/permits-api",
    provider: "github",
    ciProvider: "github_actions",
    defaultBranch: "main",
    pinnedPack: "2026.2",
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockIsGitHubAppConfigured.mockReset();
  mockGetInstallationToken.mockReset();
  mockIsGitHubAppConfigured.mockReturnValue(true);
  mockGetInstallationToken.mockResolvedValue("installation-token");
});

describe("bumpPackVersion / bumpWorkflowRef", () => {
  it("changes only the pack_version field, keeping every other line untouched", () => {
    const bumped = bumpPackVersion(MANIFEST_CONTENT, "2026.3");
    expect(bumped).toContain('pack_version: "2026.3" # pin');
    expect(bumped).toContain('build_command: "dotnet build && dotnet test" # custom local edit');
    expect(bumped).toContain("# local comment kept as-is");
  });

  it("changes only mesh_scripts_ref, keeping pack_version untouched when called alone", () => {
    const bumped = bumpWorkflowRef(WORKFLOW_CONTENT, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(bumped).toContain('mesh_scripts_ref: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"');
    expect(bumped).toContain('pack_version: "2026.2"');
  });
});

describe("openUpdatePr", () => {
  it("returns not-supported for azure_devops repositories", async () => {
    const result = await openUpdatePr(repo({ provider: "azure_devops" }), {
      packVersion: "2026.3",
      workflowRef: "goa-standards/assurance-mesh@v3",
    });
    expect(result.opened).toBe(false);
    expect(result.reason).toMatch(/Azure DevOps/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns not-configured when the GitHub App isn't set up", async () => {
    mockIsGitHubAppConfigured.mockReturnValue(false);
    const result = await openUpdatePr(repo(), { packVersion: "2026.3", workflowRef: "v3" });
    expect(result.opened).toBe(false);
    expect(result.reason).toMatch(/GitHub App/);
  });

  it("bumps the manifest and workflow file, then opens a PR", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ object: { sha: "base-sha" } }) }) // git/ref
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // create branch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: b64(MANIFEST_CONTENT), encoding: "base64", sha: "manifest-sha" }),
      }) // get manifest
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // put manifest
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: b64(WORKFLOW_CONTENT), encoding: "base64", sha: "workflow-sha" }),
      }) // get workflow
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // put workflow
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ number: 99, html_url: "https://github.com/goa/permits-api/pull/99" }),
      }); // create PR

    const result = await openUpdatePr(repo(), {
      packVersion: "2026.3",
      workflowRef: "goa-standards/assurance-mesh@v3",
    });

    expect(result.opened).toBe(true);
    expect(result.prNumber).toBe(99);

    const putManifestCall = mockFetch.mock.calls[3];
    const putManifestBody = JSON.parse((putManifestCall[1] as any).body);
    const decodedManifest = Buffer.from(putManifestBody.content, "base64").toString("utf8");
    expect(decodedManifest).toContain('pack_version: "2026.3" # pin');
    expect(decodedManifest).toContain("# custom local edit");

    const putWorkflowCall = mockFetch.mock.calls[5];
    const putWorkflowBody = JSON.parse((putWorkflowCall[1] as any).body);
    const decodedWorkflow = Buffer.from(putWorkflowBody.content, "base64").toString("utf8");
    expect(decodedWorkflow).toContain('pack_version: "2026.3"');
  });

  it("reports 'nothing to change' when both files are already on the target version/ref", async () => {
    // Workflow already pinned to the exact target ref too, so bumping is a no-op on both files.
    const workflowAlreadyOnTarget = WORKFLOW_CONTENT.replace(
      /mesh_scripts_ref:\s*"[^"]*"/,
      'mesh_scripts_ref: "goa-standards/assurance-mesh@v3"',
    );
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ object: { sha: "base-sha" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: b64(MANIFEST_CONTENT), encoding: "base64", sha: "manifest-sha" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: b64(workflowAlreadyOnTarget), encoding: "base64", sha: "workflow-sha" }),
      });

    const result = await openUpdatePr(repo(), { packVersion: "2026.2", workflowRef: "goa-standards/assurance-mesh@v3" });

    expect(result.opened).toBe(false);
    expect(result.reason).toMatch(/nothing to change/i);
  });

  it("surfaces an already-open PR (422) as opened:false with a reason, not a throw", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ object: { sha: "base-sha" } }) })
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Reference already exists" }) // branch exists
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: b64(MANIFEST_CONTENT), encoding: "base64", sha: "manifest-sha" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: b64(WORKFLOW_CONTENT), encoding: "base64", sha: "workflow-sha" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "A pull request already exists" });

    const result = await openUpdatePr(repo(), { packVersion: "2026.3", workflowRef: "v3" });

    expect(result.opened).toBe(false);
    expect(result.reason).toMatch(/already open/);
  });
});
