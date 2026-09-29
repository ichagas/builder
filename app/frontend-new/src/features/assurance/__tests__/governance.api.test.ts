import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiClient", () => ({ default: {} }));

import { canSetMode, isExceptionExpired, normalizePackChanges, standardsPackSchema } from "../governance.api";

describe("governance.api helpers", () => {
  it("only lets owners tighten or keep a mode; admins may loosen", () => {
    expect(canSetMode("issue", "block", false)).toBe(true);
    expect(canSetMode("issue", "issue", false)).toBe(true);
    expect(canSetMode("issue", "notify", false)).toBe(false);
    expect(canSetMode("block", "off", false)).toBe(false);
    expect(canSetMode("block", "off", true)).toBe(true);
  });

  it("detects expired exceptions", () => {
    const now = Date.parse("2026-09-29T00:00:00Z");
    expect(isExceptionExpired({ expires_at: "2026-09-01T00:00:00Z" }, now)).toBe(true);
    expect(isExceptionExpired({ expires_at: "2026-12-01T00:00:00Z" }, now)).toBe(false);
  });

  it("normalizes free-form pack changes", () => {
    expect(
      normalizePackChanges(["Tighter CSP", ["New", "Secrets scan"], { kind: "new", text: "SBOM" }, { type: "changed", description: "Baseline" }, 42, {}]),
    ).toEqual([
      { kind: "changed", text: "Tighter CSP" },
      { kind: "new", text: "Secrets scan" },
      { kind: "new", text: "SBOM" },
      { kind: "changed", text: "Baseline" },
    ]);
  });

  it("parses a pack row with null changes", () => {
    const pack = standardsPackSchema.parse({ version: "2026.2", published_at: "2026-09-01T00:00:00Z", notes: null, changes: null, workflow_ref: null });
    expect(pack.changes).toEqual([]);
  });
});
