import { describe, expect, it } from "vitest";
import { SCOPED_TOOL_PATH, TOOL_PATH } from "../toolPaths";

describe("ProjectLayout tool path matchers (NV-06)", () => {
  it("TOOL_PATH matches any version segment and captures phase and tool", () => {
    expect(TOOL_PATH.exec("/p/p1/v/current/define/requirements")?.slice(1)).toEqual(["define", "requirements"]);
    expect(TOOL_PATH.exec("/p/p1/v/ver-123/build/repository")?.slice(1)).toEqual(["build", "repository"]);
    expect(TOOL_PATH.exec("/p/p1/v/v1.1.0/ship/release")?.slice(1)).toEqual(["ship", "release"]);
  });

  it("TOOL_PATH ignores changes, versions and settings pages", () => {
    for (const path of ["/p/p1/changes/wi1", "/p/p1/changes/wi1/design", "/p/p1/versions", "/p/p1/settings", "/p/p1/v/current"]) {
      expect(TOOL_PATH.exec(path)).toBeNull();
    }
  });

  it("SCOPED_TOOL_PATH skips v/current but matches ids and names", () => {
    expect(SCOPED_TOOL_PATH.exec("/p/p1/v/current/define/requirements")).toBeNull();
    expect(SCOPED_TOOL_PATH.exec("/p/p1/v/ver-123/design/canvas")?.slice(1)).toEqual(["design", "canvas"]);
    expect(SCOPED_TOOL_PATH.exec("/p/p1/v/v1.1.0/ship/release")?.slice(1)).toEqual(["ship", "release"]);
    expect(SCOPED_TOOL_PATH.exec("/p/p1/versions")).toBeNull();
    expect(SCOPED_TOOL_PATH.exec("/p/p1/changes/wi1/define")).toBeNull();
  });

  it("does not treat a version literally named like a prefix of current as current", () => {
    expect(SCOPED_TOOL_PATH.exec("/p/p1/v/current2/define/requirements")).not.toBeNull();
  });
});
