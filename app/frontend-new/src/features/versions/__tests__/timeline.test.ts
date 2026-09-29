import { describe, expect, it } from "vitest";
import { buildTimeline, modeKindFor, suggestHotfixName } from "../timeline";
import type { Version } from "../api";

function version(overrides: Partial<Version>): Version {
  return {
    id: "v1",
    project_id: "p1",
    name: "v1.0.0",
    kind: "released",
    is_current: false,
    is_first_release: false,
    released_at: null,
    released_by: null,
    release_notes: null,
    git_tag: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    work_item_count: 0,
    active_work_item_count: 0,
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("falls back to a single 'Building' node for a project with no versions (D-7, spec edge case)", () => {
    const timeline = buildTimeline([]);
    expect(timeline.nodes).toEqual([{ id: "building", label: "Building", kind: "building" }]);
    expect(timeline.currentId).toBe("building");
    expect(timeline.currentKind).toBe("building");
    expect(timeline.flags).toEqual([]);
  });

  it("maps kinds onto TimelineNodeKind and flags the first release", () => {
    const versions = [
      version({ id: "v1", name: "v1.0.0", kind: "released", is_current: true, is_first_release: true, released_at: "2026-08-01T00:00:00Z" }),
      version({ id: "v2", name: "v1.0.1", kind: "hotfix", work_item_count: 2 }),
      version({ id: "v3", name: "v1.1.0", kind: "next", work_item_count: 1 }),
    ];
    const timeline = buildTimeline(versions);
    expect(timeline.nodes.map((n) => [n.id, n.kind])).toEqual([
      ["v1", "current"],
      ["v2", "hotfix"],
      ["v3", "building"],
    ]);
    expect(timeline.nodes[1].sub).toBe("2 changes");
    expect(timeline.flags).toEqual([{ afterId: "v1", label: "First release", pending: false }]);
    expect(timeline.currentId).toBe("v1");
    expect(timeline.currentKind).toBe("released");
  });

  it("marks the first-release flag pending before the first release ships", () => {
    const versions = [version({ id: "v1", name: "v1.0.0", kind: "building", is_first_release: true, work_item_count: 4 })];
    const timeline = buildTimeline(versions);
    expect(timeline.flags).toEqual([{ afterId: "v1", label: "First release", pending: true }]);
    expect(timeline.currentId).toBe("v1");
    expect(timeline.currentKind).toBe("building");
  });

  it("scopes to the released version marked is_current, not just the last one", () => {
    const versions = [
      version({ id: "v1", name: "v1.0.0", kind: "released", is_first_release: true, released_at: "2026-06-01T00:00:00Z" }),
      version({ id: "v2", name: "v1.1.0", kind: "released", is_current: true, released_at: "2026-08-01T00:00:00Z" }),
      version({ id: "v3", name: "v1.2.0", kind: "next" }),
    ];
    const timeline = buildTimeline(versions);
    expect(timeline.currentId).toBe("v2");
    expect(timeline.currentLabel).toBe("v1.1.0");
  });
});

describe("modeKindFor", () => {
  it("maps building/released eras onto ModeKind", () => {
    expect(modeKindFor("building")).toBe("building");
    expect(modeKindFor("released")).toBe("released");
  });
});

describe("suggestHotfixName", () => {
  it("bumps the patch of the current released version", () => {
    expect(suggestHotfixName("v1.4.2")).toBe("v1.4.3");
    expect(suggestHotfixName("2.0.9")).toBe("v2.0.10");
  });

  it("falls back when there's no released version yet", () => {
    expect(suggestHotfixName(undefined)).toBe("hotfix-1");
  });
});
