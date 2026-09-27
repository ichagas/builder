/**
 * Structural assertions on the generated mesh CI manifest for both providers
 * (spec 007, WP-BE6, T141). Not a byte-for-byte snapshot: the templates may
 * gain comments/formatting over time, but the contract this test protects —
 * one file at the documented path, referencing the pinned mesh templates,
 * with the run's own profile/build command/pack version — must hold.
 */
import { generateManifest } from "../../../../services/onboarding/sandbox/generateManifest";
import { isAllowedGeneratedPath } from "../../../../services/onboarding/pathValidation";

const BASE = {
  defaultBranch: "main",
  profile: "node" as const,
  buildCommand: "npm ci && npm test",
  packVersion: "2026.3",
  meshScriptsRef: "a".repeat(40),
  pronghornApiUrl: "https://api.pronghorn.example",
};

describe("generateManifest", () => {
  it("generates .github/workflows/assurance-mesh.yml for GitHub Actions", () => {
    const files = generateManifest({ ...BASE, ciProvider: "github_actions" });
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".github/workflows/assurance-mesh.yml");
    expect(files[0].content).toContain("goa-standards/assurance-mesh/.github/workflows/mesh.yml@v3");
    expect(files[0].content).toContain("profile: node");
    expect(files[0].content).toContain('pack_version: "2026.3"');
    expect(files[0].content).toContain(BASE.meshScriptsRef);
    expect(files[0].content).toContain("secrets.PRONGHORN_REPORT_SECRET");
    expect(files[0].content).toMatch(/branches: \[main\]/);
    expect(isAllowedGeneratedPath(files[0].path)).toBe(true);
  });

  it("generates azure-pipelines/assurance-mesh.yml for Azure Pipelines", () => {
    const files = generateManifest({ ...BASE, ciProvider: "azure_pipelines", profile: "dotnet", buildCommand: "dotnet build" });
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("azure-pipelines/assurance-mesh.yml");
    expect(files[0].content).toContain("template: templates/mesh.yml@assuranceMesh");
    expect(files[0].content).toContain("profile: dotnet");
    expect(files[0].content).toContain(BASE.meshScriptsRef);
    expect(files[0].content).toContain("PRONGHORN_REPORT_SECRET");
    expect(files[0].content).toContain("include:\n      - main");
    expect(isAllowedGeneratedPath(files[0].path)).toBe(true);
  });

  it("respects a non-default default branch", () => {
    const files = generateManifest({ ...BASE, ciProvider: "github_actions", defaultBranch: "develop" });
    expect(files[0].content).toMatch(/branches: \[develop\]/);
  });

  it("falls back to a placeholder SHA when meshScriptsRef is empty (not yet configured)", () => {
    const files = generateManifest({ ...BASE, ciProvider: "github_actions", meshScriptsRef: "" });
    expect(files[0].content).toContain("0000000000000000000000000000000000000000");
  });

  it("escapes double quotes in the build command", () => {
    const files = generateManifest({ ...BASE, ciProvider: "github_actions", buildCommand: 'echo "hi"' });
    expect(files[0].content).toContain('echo \\"hi\\"');
  });
});
