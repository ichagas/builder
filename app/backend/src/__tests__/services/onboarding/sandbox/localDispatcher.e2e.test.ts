/**
 * Local end-to-end test for the onboarding sandbox (spec 007, WP-BE6, T141).
 *
 * The acceptance target "a two-repo sample onboarded in dev in <= 10
 * minutes" needs a real Azure Container Apps Job and real repository
 * credentials, neither of which exist in CI — see the module docstring on
 * `jobDispatcher.ts` and this work package's report for the documented
 * BLOCKED-EXTERNAL real-run steps (recorded in
 * `specs/007-frontend-new/quickstart.md`). This test exercises the same
 * *logic* end-to-end instead: two fixture repositories under
 * `__tests__/fixtures/onboarding-sandbox/` — one with a GitHub Actions
 * workflow and a `package.json` (Node.js), one with an `azure-pipelines.yml`
 * and a `.csproj` (.NET) — run through `LocalJobDispatcher` with a
 * `SandboxRunner` that does exactly what the real sandbox image does
 * (list files, detect, generate) against a local directory instead of a
 * fresh git clone. No network, no Docker; runs in well under a second.
 */
import fs from "fs";
import path from "path";
import { LocalJobDispatcher, SandboxRunner, JobRepoResult, DetectedCiProvider } from "../../../../services/onboarding/jobDispatcher";
import { detectCiProvider, detectStack, RepositoryHost } from "../../../../services/onboarding/sandbox/detect";
import { generateManifest } from "../../../../services/onboarding/sandbox/generateManifest";
import { isAllowedGeneratedPath } from "../../../../services/onboarding/pathValidation";
import { inferRepositoryProvider } from "../../../../services/repositories/fullName";

const FIXTURES_ROOT = path.join(__dirname, "..", "..", "..", "fixtures", "onboarding-sandbox");

function listFilesRecursive(dir: string, prefix = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listFilesRecursive(path.join(dir, entry.name), rel);
    return [rel];
  });
}

/** Mirrors what the real sandbox image's entrypoint does after cloning, minus the clone itself. */
class FixtureSandboxRunner implements SandboxRunner {
  constructor(private readonly reposByFullName: Record<string, { dir: string; host: RepositoryHost }>) {}

  async runRepository(input: { fullName: string }): Promise<JobRepoResult> {
    const fixture = this.reposByFullName[input.fullName];
    if (!fixture) throw new Error(`no fixture for ${input.fullName}`);

    const files = listFilesRecursive(fixture.dir);
    const detectedCi: DetectedCiProvider = detectCiProvider(files, fixture.host);
    const stack = detectStack(files);
    const manifest = generateManifest({
      ciProvider: detectedCi,
      defaultBranch: "main",
      profile: stack.profile,
      buildCommand: stack.buildCommand,
      packVersion: "2026.3",
      meshScriptsRef: "b".repeat(40),
      pronghornApiUrl: "https://api.pronghorn.example",
    });

    return {
      fullName: input.fullName,
      detectedProfile: stack.profile,
      detectedStack: stack.stackLabel,
      detectedBuild: stack.buildCommand,
      detectedCi,
      generatedManifest: manifest,
      baselineCounts: { green: 0, yellow: 0, red: 0, blue: 0 },
    };
  }
}

describe("onboarding sandbox — local end-to-end (two-repo sample)", () => {
  const GITHUB_REPO = "goa/permits-api";
  const AZURE_REPO = "goa-devops/permits/permits-api";

  it("detects each repository's own CI provider and stack, and generates the right manifest for each", async () => {
    expect(inferRepositoryProvider(GITHUB_REPO)).toBe("github");
    expect(inferRepositoryProvider(AZURE_REPO)).toBe("azure_devops");

    const runner = new FixtureSandboxRunner({
      [GITHUB_REPO]: { dir: path.join(FIXTURES_ROOT, "github-repo"), host: "github" },
      [AZURE_REPO]: { dir: path.join(FIXTURES_ROOT, "azure-repo"), host: "azure_devops" },
    });
    const dispatcher = new LocalJobDispatcher(runner);

    const progressEvents: any[] = [];
    let result: any;
    await new Promise<void>((resolve) => {
      dispatcher.dispatch(
        {
          runId: "run-e2e-1",
          teamId: "team-1",
          organizationId: "org-1",
          repositories: [{ fullName: GITHUB_REPO }, { fullName: AZURE_REPO }],
        },
        async (r) => {
          result = r;
        },
        (e) => {
          progressEvents.push(e);
          if (e.type === "done") resolve();
        }
      );
    });

    expect(result.status).toBe("ready");
    expect(result.repositories).toHaveLength(2);

    const github = result.repositories.find((r: JobRepoResult) => r.fullName === GITHUB_REPO);
    expect(github.detectedCi).toBe("github_actions");
    expect(github.detectedProfile).toBe("node");
    expect(github.generatedManifest).toHaveLength(1);
    expect(github.generatedManifest[0].path).toBe(".github/workflows/assurance-mesh.yml");
    expect(isAllowedGeneratedPath(github.generatedManifest[0].path)).toBe(true);

    const azure = result.repositories.find((r: JobRepoResult) => r.fullName === AZURE_REPO);
    expect(azure.detectedCi).toBe("azure_pipelines");
    expect(azure.detectedProfile).toBe("dotnet");
    expect(azure.generatedManifest).toHaveLength(1);
    expect(azure.generatedManifest[0].path).toBe("azure-pipelines/assurance-mesh.yml");
    expect(isAllowedGeneratedPath(azure.generatedManifest[0].path)).toBe(true);

    expect(progressEvents.some((e) => e.type === "log")).toBe(true);
    expect(progressEvents.some((e) => e.type === "done")).toBe(true);
  });
});
