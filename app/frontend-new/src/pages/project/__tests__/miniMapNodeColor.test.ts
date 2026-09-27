import { describe, expect, it } from "vitest";
import { getMiniMapNodeColor } from "../miniMapNodeColor";

describe("getMiniMapNodeColor", () => {
  it.each([
    ["COMPONENT", "var(--cat-2)"],
    ["API", "var(--cat-4)"],
    ["DATABASE", "var(--cat-6)"],
    ["SERVICE", "var(--cat-8)"],
    ["OTHER", "var(--muted)"],
    [undefined, "var(--muted)"],
  ])("%s -> %s", (type, expected) => {
    expect(getMiniMapNodeColor(type)).toBe(expected);
  });

  it("never returns a raw hex color (tokens only, WP-F2b fix round 1)", () => {
    const types = ["COMPONENT", "API", "DATABASE", "SERVICE", "OTHER", undefined];
    for (const type of types) {
      expect(getMiniMapNodeColor(type)).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(getMiniMapNodeColor(type)).toMatch(/^var\(--[\w-]+\)$/);
    }
  });
});
