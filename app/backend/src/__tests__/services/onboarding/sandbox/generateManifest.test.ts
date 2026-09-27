/**
 * Structural assertions on the generated mesh CI manifest for both providers
 * (spec 007, WP-BE6, T141). Not a byte-for-byte snapshot: the templates may
 * gain comments/formatting over time, but the contract this test protects —
 * one file at the documented path, referencing the pinned mesh templates,
 * with the run's own profile/build command/pack version — must hold.
 */
import yaml from "js-yaml";
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

  it("emits valid YAML for the GitHub Actions workflow, pinned to the mesh workflow's v3 ref", () => {
    const files = generateManifest({ ...BASE, ciProvider: "github_actions" });
    const doc = yaml.load(files[0].content) as any;
    expect(doc.jobs.mesh.uses).toBe("goa-standards/assurance-mesh/.github/workflows/mesh.yml@v3");
    expect(doc.on.pull_request.branches).toEqual(["main"]);
    expect(doc.jobs.mesh.with.profile).toBe("node");
    expect(doc.jobs.mesh.with.mesh_scripts_ref).toBe(BASE.meshScriptsRef);
  });

  it("emits valid YAML for the Azure Pipelines manifest, pinned to the mesh templates' v3-released SHA", () => {
    const files = generateManifest({ ...BASE, ciProvider: "azure_pipelines", profile: "dotnet", buildCommand: "dotnet build" });
    const doc = yaml.load(files[0].content) as any;
    expect(doc.resources.repositories[0].name).toBe("goa-standards/assurance-mesh");
    expect(doc.resources.repositories[0].ref).toBe(BASE.meshScriptsRef);
    expect(doc.extends.template).toBe("templates/mesh.yml@assuranceMesh");
    expect(doc.extends.parameters.profile).toBe("dotnet");
  });

  it("still parses as valid YAML with special characters in the build command", () => {
    const files = generateManifest({ ...BASE, ciProvider: "github_actions", buildCommand: 'echo "hi: there" && echo \'x\'' });
    expect(() => yaml.load(files[0].content)).not.toThrow();
    const doc = yaml.load(files[0].content) as any;
    expect(doc.jobs.mesh.with.build_command).toBe('echo "hi: there" && echo \'x\'');
  });
});
