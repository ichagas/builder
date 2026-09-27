/**
 * Unit tests for services/repositories/fullName.ts — the single shared
 * `full_name` parser (spec 007, WP-BE5, fix round 3).
 */
import {
  parseRepositoryFullName,
  tryParseRepositoryFullName,
  inferRepositoryProvider,
  parseAnyRepositoryFullName,
  formatAzureFullName,
  formatGitHubFullName,
  InvalidRepositoryFullNameError,
} from "../../../services/repositories/fullName";

describe("parseRepositoryFullName — github", () => {
  it("parses <owner>/<repo>", () => {
    expect(parseRepositoryFullName("github", "goa/permits-api")).toEqual({
      provider: "github",
      owner: "goa",
      repo: "permits-api",
      fullName: "goa/permits-api",
    });
    expect(parseRepositoryFullName("github", "My-Org/repo.name_1").repo).toBe("repo.name_1");
  });

  it.each([
    ["one segment", "permits-api"],
    ["three segments (an Azure name)", "org/project/repo"],
    ["empty owner", "/repo"],
    ["empty repo", "goa/"],
    ["dot repo", "goa/.."],
    ["space in repo", "goa/permits api"],
    ["owner starting with a hyphen", "-goa/repo"],
    ["owner over 39 chars", `${"a".repeat(40)}/repo`],
    ["query/fragment smuggling", "goa/repo?x=1"],
    ["path traversal", "goa/../../admin"],
    ["empty string", ""],
  ])("rejects %s", (_label, value) => {
    expect(() => parseRepositoryFullName("github", value)).toThrow(InvalidRepositoryFullNameError);
  });

  it("rejects non-strings", () => {
    expect(() => parseRepositoryFullName("github", undefined)).toThrow(InvalidRepositoryFullNameError);
    expect(() => parseRepositoryFullName("github", 42)).toThrow(InvalidRepositoryFullNameError);
  });
});

describe("parseRepositoryFullName — azure_devops", () => {
  it("parses <adoOrg>/<project>/<repo> (project is the MIDDLE segment)", () => {
    expect(parseRepositoryFullName("azure_devops", "contoso/My Project/permits-api")).toEqual({
      provider: "azure_devops",
      adoOrg: "contoso",
      project: "My Project",
      repo: "permits-api",
      fullName: "contoso/My Project/permits-api",
    });
  });

  it.each([
    ["the legacy 2-segment <project>/<repo> form", "MyProject/permits-api"],
    ["four segments", "a/b/c/d"],
    ["an empty project", "contoso//repo"],
    ["an empty repo", "contoso/project/"],
    ["a dot project", "contoso/./repo"],
    ["a forbidden character", "contoso/proj:ect/repo"],
    ["a control character", "contoso/project/re\npo"],
    ["leading whitespace", "contoso/ project/repo"],
    ["an invalid org", "con toso/project/repo"],
  ])("rejects %s", (_label, value) => {
    expect(() => parseRepositoryFullName("azure_devops", value)).toThrow(InvalidRepositoryFullNameError);
  });
});

describe("inferRepositoryProvider / parseAnyRepositoryFullName", () => {
  it("infers the provider from the segment count", () => {
    expect(inferRepositoryProvider("goa/permits-api")).toBe("github");
    expect(inferRepositoryProvider("contoso/Project/permits-api")).toBe("azure_devops");
    expect(inferRepositoryProvider("permits-api")).toBeNull();
    expect(inferRepositoryProvider("a/b/c/d")).toBeNull();
    expect(inferRepositoryProvider(null)).toBeNull();
  });

  it("parseAnyRepositoryFullName throws for neither shape", () => {
    expect(parseAnyRepositoryFullName("contoso/P/r")).toMatchObject({ provider: "azure_devops", project: "P" });
    expect(() => parseAnyRepositoryFullName("nope")).toThrow(InvalidRepositoryFullNameError);
  });

  it("tryParseRepositoryFullName returns null instead of throwing", () => {
    expect(tryParseRepositoryFullName("azure_devops", "goa/permits-api")).toBeNull();
    expect(tryParseRepositoryFullName("github", "goa/permits-api")).not.toBeNull();
  });
});

describe("format helpers", () => {
  it("build validated names", () => {
    expect(formatGitHubFullName("goa", "permits-api")).toBe("goa/permits-api");
    expect(formatAzureFullName("contoso", "Project", "repo")).toBe("contoso/Project/repo");
    expect(() => formatAzureFullName("contoso", "Pro/ject", "repo")).toThrow(InvalidRepositoryFullNameError);
  });
});
