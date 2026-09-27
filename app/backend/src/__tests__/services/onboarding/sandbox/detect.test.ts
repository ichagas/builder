/**
 * Unit tests for CI-provider and stack-profile detection (spec 007, WP-BE6, T141).
 */
import { detectCiProvider, detectStack } from "../../../../services/onboarding/sandbox/detect";

describe("detectCiProvider", () => {
  it("detects GitHub Actions from .github/workflows/", () => {
    expect(detectCiProvider([".github/workflows/ci.yml", "package.json"], "github")).toBe("github_actions");
  });

  it("detects Azure Pipelines from a top-level azure-pipelines.yml", () => {
    expect(detectCiProvider(["azure-pipelines.yml", "pom.xml"], "azure_devops")).toBe("azure_pipelines");
  });

  it("detects Azure Pipelines from a named azure-pipelines-*.yml", () => {
    expect(detectCiProvider(["azure-pipelines-release.yml"], "azure_devops")).toBe("azure_pipelines");
  });

  it("detects Azure Pipelines from .azure-pipelines/", () => {
    expect(detectCiProvider([".azure-pipelines/build.yml"], "azure_devops")).toBe("azure_pipelines");
  });

  it("prefers an actual GitHub Actions workflow over the host fallback", () => {
    expect(detectCiProvider([".github/workflows/ci.yml"], "azure_devops")).toBe("github_actions");
  });

  it("falls back to the repository's host when no CI config is found (github)", () => {
    expect(detectCiProvider(["README.md"], "github")).toBe("github_actions");
  });

  it("falls back to the repository's host when no CI config is found (azure_devops)", () => {
    expect(detectCiProvider(["README.md"], "azure_devops")).toBe("azure_pipelines");
  });

  it("prefers GitHub Actions when both a workflow and an azure-pipelines.yml are present", () => {
    expect(detectCiProvider([".github/workflows/ci.yml", "azure-pipelines.yml"], "azure_devops")).toBe("github_actions");
  });

  it("falls back to azure_pipelines for an Azure Repos host with no CI files at all (no README either)", () => {
    expect(detectCiProvider([], "azure_devops")).toBe("azure_pipelines");
  });

  it("does not mistake a nested/similarly-named file for the top-level azure-pipelines.yml convention", () => {
    // "azure-pipelines.yaml" inside a subdirectory, and a file that merely
    // contains "azure-pipelines" in its name, must not match the top-level
    // azure-pipelines(-*).yml regex or the .azure-pipelines/ prefix check.
    expect(detectCiProvider(["docs/azure-pipelines.yml", "my-azure-pipelines.yml"], "github")).toBe("github_actions");
  });
});

describe("detectStack", () => {
  it("detects .NET from a .csproj", () => {
    const stack = detectStack(["src/Api/Api.csproj", "README.md"]);
    expect(stack.profile).toBe("dotnet");
    expect(stack.buildCommand).toContain("dotnet build");
  });

  it("detects Java (Maven) from pom.xml", () => {
    expect(detectStack(["pom.xml"]).profile).toBe("java");
  });

  it("detects Java (Gradle) from build.gradle.kts", () => {
    const stack = detectStack(["build.gradle.kts"]);
    expect(stack.profile).toBe("java");
    expect(stack.buildCommand).toContain("gradlew");
  });

  it("detects Python from pyproject.toml", () => {
    expect(detectStack(["pyproject.toml"]).profile).toBe("python");
  });

  it("detects Node.js from package.json", () => {
    const stack = detectStack(["package.json", "src/index.ts"]);
    expect(stack.profile).toBe("node");
    expect(stack.buildCommand).toContain("npm");
  });

  it("prefers .NET over Node.js when both markers are present (ordered heuristic)", () => {
    expect(detectStack(["Api.csproj", "package.json"]).profile).toBe("dotnet");
  });

  it("defaults to node with a placeholder build command when nothing matches", () => {
    const stack = detectStack(["README.md"]);
    expect(stack.profile).toBe("node");
    expect(stack.stackLabel).toMatch(/unknown/i);
  });
});
