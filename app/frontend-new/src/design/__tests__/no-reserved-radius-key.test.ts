import { describe, expect, it } from "vitest";
import postcss from "postcss";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import tailwindcss from "tailwindcss";
import { designSystemPreset } from "../tailwind-preset";

/**
 * Fix round 1, item 1: the preset's borderRadius scale used to add a key
 * named "s" (`rounded-s`), which collides with Tailwind core's own
 * logical-corner utility of the same name (v3.3+): `borderRadius` utilities
 * are generated once per {prefix × theme key}, and "rounded" + key "s" (our
 * full, four-corner radius) produces the exact same class name — `rounded-s`
 * — as "rounded-s" (Tailwind's start-corner prefix) + the DEFAULT key. Both
 * end up defining `.rounded-s`, and only the start corners rendered at 4px.
 *
 * This compiles the real preset with Tailwind/PostCSS (not string matching
 * on source) so it fails again if any future preset key reintroduces a
 * reserved corner name.
 */
describe("borderRadius preset key naming (T023 fix round 1, item 1)", () => {
  const RESERVED_CORNER_KEYS = ["s", "e", "t", "r", "b", "l", "ss", "se", "es", "ee", "tl", "tr", "bl", "br"];

  it("declares no borderRadius key reserved by Tailwind's corner utilities", () => {
    const keys = Object.keys((designSystemPreset.theme?.extend?.borderRadius as Record<string, string>) ?? {});
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(RESERVED_CORNER_KEYS).not.toContain(key);
    }
  });

  it("emits `.rounded-xs` exactly once, rounding all four corners (not just the start corners)", async () => {
    const config = {
      presets: [designSystemPreset],
      content: [{ raw: '<div class="rounded-xs rounded-s"></div>', extension: "html" as const }],
      corePlugins: { preflight: false },
    };

    const result = await postcss([tailwindcss(config)]).process("@tailwind utilities;", { from: undefined });
    const css = result.css;

    const roundedXs = css.match(/\.rounded-xs\s*\{[^}]*\}/g) ?? [];
    expect(roundedXs).toHaveLength(1);
    expect(roundedXs[0]).toContain("border-radius:");
    expect(roundedXs[0]).not.toMatch(/border-(start|end)-(start|end)-radius/);

    // Tailwind's own reserved `rounded-s` (logical start corners) must still
    // exist, untouched — no second, colliding definition from the preset.
    const roundedS = css.match(/\.rounded-s\s*\{[^}]*\}/g) ?? [];
    expect(roundedS).toHaveLength(1);
    expect(roundedS[0]).toMatch(/border-(start|end)-(start|end)-radius/);
  });
});
