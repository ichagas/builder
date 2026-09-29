import { describe, expect, it } from "vitest";
import type { Version, WorkItem } from "../api";
import {
  carryOverVersionName,
  findBlockingVersion,
  hasFirstRelease,
  releaseErrorMessage,
  resolveReleaseTarget,
  splitChanges,
} from "../release/logic";

function v(name: string, kind: Version["kind"], id = name): Version {
  return {
    id,
    project_id: "p1",
    name,
    kind,
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
  };
}

function wi(status: WorkItem["status"], type: WorkItem["type"] = "bug"): WorkItem {
  return { id: status + type, status, type } as WorkItem;
}

describe("release logic", () => {
  it("bumps the minor for carry-over", () => {
    expect(carryOverVersionName("v1.4.2")).toBe("v1.5.0");
    expect(carryOverVersionName("v1.1.0")).toBe("v1.2.0");
  });

  it("detects the first release", () => {
    expect(hasFirstRelease([v("v1.0.0", "building")])).toBe(false);
    expect(hasFirstRelease([v("v1.0.0", "released"), v("v1.1.0", "next")])).toBe(true);
  });

  it("resolves a target by name or `current` (lowest open)", () => {
    const list = [v("v1.0.0", "released"), v("v1.2.0", "planned"), v("v1.1.0", "next")];
    expect(resolveReleaseTarget(list, "v1.2.0")?.name).toBe("v1.2.0");
    expect(resolveReleaseTarget(list, "current")?.name).toBe("v1.1.0");
    expect(resolveReleaseTarget(list, "v9.9.9")).toBeUndefined();
  });

  it("finds an open earlier version that must release first", () => {
    const list = [v("v1.0.0", "released"), v("v1.0.1", "hotfix"), v("v1.1.0", "next")];
    expect(findBlockingVersion(list, list[2])?.name).toBe("v1.0.1");
    expect(findBlockingVersion(list, list[1])).toBeUndefined();
  });

  it("splits shipped, carry-over and declined changes", () => {
    const { shipped, carry, declined } = splitChanges([wi("shipped"), wi("active"), wi("triage"), wi("declined")]);
    expect([shipped.length, carry.length, declined.length]).toEqual([1, 2, 1]);
  });

  it("builds an error message from failing checks", () => {
    const msg = releaseErrorMessage({ message: "Validation failed", details: { checks: [{ label: "x", detail: "Release v1.0.1 first" }] } }, "fallback");
    expect(msg).toBe("Validation failed: Release v1.0.1 first");
    expect(releaseErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
