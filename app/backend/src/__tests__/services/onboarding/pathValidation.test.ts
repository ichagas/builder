/**
 * Unit tests for generated-file path validation (spec 007, WP-BE5, fix
 * round 1 item 8).
 */
import { isAllowedGeneratedPath, findDisallowedPath } from "../../../services/onboarding/pathValidation";

describe("isAllowedGeneratedPath", () => {
  it("allows GitHub Actions workflow paths under .github/", () => {
    expect(isAllowedGeneratedPath(".github/workflows/assurance-mesh.yml")).toBe(true);
  });

  it("allows a top-level azure-pipelines.yml (and named variants)", () => {
    expect(isAllowedGeneratedPath("azure-pipelines.yml")).toBe(true);
    expect(isAllowedGeneratedPath("azure-pipelines-mesh.yaml")).toBe(true);
  });

  it("allows files under azure-pipelines/", () => {
    expect(isAllowedGeneratedPath("azure-pipelines/mesh.yml")).toBe(true);
  });

  it("rejects an absolute path", () => {
    expect(isAllowedGeneratedPath("/etc/passwd")).toBe(false);
  });

  it("rejects a path escaping the repository with ..", () => {
    expect(isAllowedGeneratedPath("../../etc/passwd")).toBe(false);
    expect(isAllowedGeneratedPath(".github/../../../etc/passwd")).toBe(false);
  });

  it("rejects a backslash (Windows-style traversal / ambiguity)", () => {
    expect(isAllowedGeneratedPath(".github\\workflows\\evil.yml")).toBe(false);
  });

  it("rejects a NUL byte", () => {
    expect(isAllowedGeneratedPath(".github/workflows/evil.yml\0.txt")).toBe(false);
  });

  it("rejects a path outside the documented generated roots", () => {
    expect(isAllowedGeneratedPath("src/index.ts")).toBe(false);
    expect(isAllowedGeneratedPath("package.json")).toBe(false);
    expect(isAllowedGeneratedPath(".gitlab-ci.yml")).toBe(false);
  });

  it("rejects empty, non-string or home-relative paths", () => {
    expect(isAllowedGeneratedPath("")).toBe(false);
    expect(isAllowedGeneratedPath(undefined)).toBe(false);
    expect(isAllowedGeneratedPath(null)).toBe(false);
    expect(isAllowedGeneratedPath(42)).toBe(false);
    expect(isAllowedGeneratedPath("~/.ssh/authorized_keys")).toBe(false);
  });

  it("rejects an empty path segment (e.g. a double slash)", () => {
    expect(isAllowedGeneratedPath(".github//workflows/evil.yml")).toBe(false);
  });
});

describe("findDisallowedPath", () => {
  it("returns null when every file is allowed", () => {
    expect(
      findDisallowedPath([
        { path: ".github/workflows/assurance-mesh.yml", content: "a" },
        { path: "azure-pipelines.yml", content: "b" },
      ])
    ).toBeNull();
  });

  it("returns the first disallowed path", () => {
    expect(
      findDisallowedPath([
        { path: ".github/workflows/assurance-mesh.yml", content: "a" },
        { path: "../../etc/passwd", content: "evil" },
      ])
    ).toBe("../../etc/passwd");
  });
});
