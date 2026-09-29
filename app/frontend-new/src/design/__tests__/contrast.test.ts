import { describe, expect, it } from "vitest";
import { AA_TEXT, contrastRatio, hueDegrees, hueDistance } from "../contrast";

/**
 * T020 acceptance: contrast OK in light and dark. Hex values below are a
 * literal mirror of src/design/tokens.css (kept in sync manually — this
 * file lives in src/design/**, which the token-lint rule exempts).
 */
const LIGHT = {
  bg: "#E8EDF4",
  surface: "#FFFFFF",
  surface2: "#F2F5F9",
  cat1: "#4F46E5",
  cat2: "#0F766E",
  cat3: "#A21CAF",
  // Fix round 2, item 2: cat4/cat5/cat8 re-hued away from the warn/bad
  // orange-red band (see contracts/design-system.md §1.2's note).
  cat4: "#184EAA",
  cat5: "#6920B6",
  cat6: "#155E75",
  cat7: "#4D7C0F",
  cat8: "#981B62",
  ink: "#0F1D35",
  muted: "#4F5F78",
  primary: "#2451D6",
  primarySoft: "#E3EAFC",
  define: "#7C3AED",
  defineInk: "#6D28D9",
  primaryForeground: "#FFFFFF",
  // Fix round 1, item 4: #13803D on ok-soft was 4.28:1 and #B45309 on
  // warn-soft was 4.40:1 — both below AA. Darkened minimally (see
  // contracts/design-system.md §1's note) to clear 4.5:1 with margin.
  ok: "#127B3B",
  okSoft: "#DDF2E5",
  warn: "#B05109",
  warnSoft: "#FCEEDB",
  bad: "#C0262D",
  badSoft: "#FBE4E5",
  statusForeground: "#FFFFFF",
  tBug: "#C0262D",
  tBugSoft: "#FBE4E5",
  tFeat: "#2451D6",
  tFeatSoft: "#E3EAFC",
  tEnh: "#0E7490",
  tEnhSoft: "#DDF3F7",
  tBase: "#475467",
  tBaseSoft: "#EEF1F5",
  mGreen: "#16A34A",
  mYellow: "#CA8A04",
  mRed: "#DC2626",
  mBlue: "#2563EB",
};

const DARK = {
  bg: "#0E1626",
  surface: "#142036",
  surface2: "#182842",
  cat1: "#8B85F5",
  cat2: "#2DD4BF",
  cat3: "#E879F9",
  cat4: "#689BF3",
  cat5: "#B67EF1",
  cat6: "#38BDF8",
  cat7: "#A3E635",
  cat8: "#EF6CB6",
  ink: "#E9EEF7",
  muted: "#9FB0CC",
  primary: "#6C93FF",
  primarySoft: "#1B2C55",
  define: "#A78BFA",
  defineInk: "#C4B5FD",
  primaryForeground: "#0B1830",
  ok: "#3DDC84",
  okSoft: "#123626",
  warn: "#F2A93B",
  warnSoft: "#3A2B12",
  bad: "#F2807C",
  badSoft: "#3A1720",
  statusForeground: "#0B1830",
  tBug: "#F2807C",
  tBugSoft: "#3A1720",
  tFeat: "#6C93FF",
  tFeatSoft: "#1B2C55",
  tEnh: "#22C3DE",
  tEnhSoft: "#123240",
  tBase: "#9FB0CC",
  tBaseSoft: "#1A2438",
  mGreen: "#22C55E",
  mYellow: "#EAB308",
  mRed: "#EF4444",
  mBlue: "#3B82F6",
};

describe("token contrast (WCAG AA, ratio >= 4.5:1)", () => {
  it.each([
    ["light ink/bg", LIGHT.ink, LIGHT.bg],
    ["light ink/surface", LIGHT.ink, LIGHT.surface],
    ["light muted/surface", LIGHT.muted, LIGHT.surface],
    ["light primary-foreground/primary", LIGHT.primaryForeground, LIGHT.primary],
    ["light ok/surface", LIGHT.ok, LIGHT.surface],
    ["light warn/surface", LIGHT.warn, LIGHT.surface],
    ["light bad/surface", LIGHT.bad, LIGHT.surface],
    ["dark ink/bg", DARK.ink, DARK.bg],
    ["dark ink/surface", DARK.ink, DARK.surface],
    ["dark muted/surface", DARK.muted, DARK.surface],
    ["dark primary-foreground/primary", DARK.primaryForeground, DARK.primary],
    ["dark ok/surface", DARK.ok, DARK.surface],
    ["dark warn/surface", DARK.warn, DARK.surface],
    ["dark bad/surface", DARK.bad, DARK.surface],
    ["light ok-foreground/ok", LIGHT.statusForeground, LIGHT.ok],
    ["light warn-foreground/warn", LIGHT.statusForeground, LIGHT.warn],
    ["light bad-foreground/bad", LIGHT.statusForeground, LIGHT.bad],
    ["dark ok-foreground/ok", DARK.statusForeground, DARK.ok],
    ["dark warn-foreground/warn", DARK.statusForeground, DARK.warn],
    ["dark bad-foreground/bad", DARK.statusForeground, DARK.bad],
  ])("%s >= 4.5:1", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

/**
 * These pairs are the actual foreground/background combinations rendered by
 * the T023 domain atoms (DeltaChip, TypeChip, AdoptionBar, MeshDots), not
 * just the raw status tokens on a plain surface. A status token's "-soft"
 * background (used by DeltaChip/TypeChip as `bg-x-soft text-x`) and the
 * Assurance Mesh dot backgrounds (used by MeshDots as `bg-mesh-x` with
 * per-agent text — `text-ink` for green/yellow, `text-primary-foreground`
 * for red/blue, see MeshDots.tsx) are separate token pairs from "x on
 * surface" and must each individually clear AA on their own.
 */
describe("domain-atom token pairs (WCAG AA, ratio >= 4.5:1)", () => {
  it.each([
    // DeltaChip / TypeChip: colored text on that status's own soft tint.
    ["light ok/ok-soft (DeltaChip 'new')", LIGHT.ok, LIGHT.okSoft],
    ["light warn/warn-soft (DeltaChip 'changed', AdoptionBar older pack)", LIGHT.warn, LIGHT.warnSoft],
    ["light bad/bad-soft (DeltaChip 'regression')", LIGHT.bad, LIGHT.badSoft],
    ["light t-bug/t-bug-soft (TypeChip 'bug')", LIGHT.tBug, LIGHT.tBugSoft],
    ["light t-feat/t-feat-soft (TypeChip 'feature')", LIGHT.tFeat, LIGHT.tFeatSoft],
    ["light t-enh/t-enh-soft (TypeChip 'enhancement')", LIGHT.tEnh, LIGHT.tEnhSoft],
    ["light t-base/t-base-soft (TypeChip 'base')", LIGHT.tBase, LIGHT.tBaseSoft],
    ["dark ok/ok-soft (DeltaChip 'new')", DARK.ok, DARK.okSoft],
    ["dark warn/warn-soft (DeltaChip 'changed', AdoptionBar older pack)", DARK.warn, DARK.warnSoft],
    ["dark bad/bad-soft (DeltaChip 'regression')", DARK.bad, DARK.badSoft],
    ["dark t-bug/t-bug-soft (TypeChip 'bug')", DARK.tBug, DARK.tBugSoft],
    ["dark t-feat/t-feat-soft (TypeChip 'feature')", DARK.tFeat, DARK.tFeatSoft],
    ["dark t-enh/t-enh-soft (TypeChip 'enhancement')", DARK.tEnh, DARK.tEnhSoft],
    ["dark t-base/t-base-soft (TypeChip 'base')", DARK.tBase, DARK.tBaseSoft],
    // AdoptionBar latest segment: primary-foreground text on solid `ok`.
    ["light primary-foreground/ok (AdoptionBar latest)", LIGHT.primaryForeground, LIGHT.ok],
    ["dark primary-foreground/ok (AdoptionBar latest)", DARK.primaryForeground, DARK.ok],
    // MeshDots: green/yellow render dark ink text in light theme (white
    // fails there: 3.30:1 / 2.94:1); red/blue keep primary-foreground
    // (white), which already clears AA on both. See MeshDots.tsx AGENT_TEXT.
    ["light ink/mesh-green (MeshDots)", LIGHT.ink, LIGHT.mGreen],
    ["light ink/mesh-yellow (MeshDots)", LIGHT.ink, LIGHT.mYellow],
    ["light primary-foreground/mesh-red (MeshDots)", LIGHT.primaryForeground, LIGHT.mRed],
    ["light primary-foreground/mesh-blue (MeshDots)", LIGHT.primaryForeground, LIGHT.mBlue],
    ["dark primary-foreground/mesh-green (MeshDots)", DARK.primaryForeground, DARK.mGreen],
    ["dark primary-foreground/mesh-yellow (MeshDots)", DARK.primaryForeground, DARK.mYellow],
    ["dark primary-foreground/mesh-red (MeshDots)", DARK.primaryForeground, DARK.mRed],
    ["dark primary-foreground/mesh-blue (MeshDots)", DARK.primaryForeground, DARK.mBlue],
  ])("%s >= 4.5:1", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

/**
 * WCAG 1.4.11 (non-text contrast): the categorical palette (`--cat-1..8`,
 * WP-F2b fix round 1, contracts/design-system.md §1.2) is used for legend
 * swatches and icon colors, not body text, so the bar is 3:1 rather than
 * 4.5:1. Verified against every surface a legend can sit on.
 */
const AA_NON_TEXT = 3;

describe("categorical palette contrast (WCAG 1.4.11, ratio >= 3:1)", () => {
  const cats = ["cat1", "cat2", "cat3", "cat4", "cat5", "cat6", "cat7", "cat8"] as const;

  it.each(
    cats.flatMap((cat) => [
      [`light ${cat}/surface`, LIGHT[cat], LIGHT.surface],
      [`light ${cat}/surface2`, LIGHT[cat], LIGHT.surface2],
      [`light ${cat}/bg`, LIGHT[cat], LIGHT.bg],
      [`dark ${cat}/surface`, DARK[cat], DARK.surface],
      [`dark ${cat}/surface2`, DARK[cat], DARK.surface2],
      [`dark ${cat}/bg`, DARK[cat], DARK.bg],
    ])
  )("%s >= 3:1", (_label, fg, bg) => {
    expect(contrastRatio(fg as string, bg as string)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

/**
 * WP-F2b fix round 2, item 2: a categorical swatch must never read as a
 * status color by coincidence. `--cat-4` (gold, ~35°) and `--cat-8` (brown,
 * ~15°) originally sat inside the `--warn` (~26°/36°) / `--bad` (~357°/2°)
 * orange-red band; generalizing this check to every `--cat-N` also caught
 * `--cat-5` (rose, ~335°/351°) against `--bad`. All three were re-hued (see
 * contracts/design-system.md §1.2's note); this asserts every `--cat-N`
 * clears the floor in both themes, for all of them, not just the three that
 * needed fixing.
 */
const MIN_HUE_SEPARATION = 25;

describe("categorical palette hue separation (>= 25° from ok/warn/bad)", () => {
  const cats = ["cat1", "cat2", "cat3", "cat4", "cat5", "cat6", "cat7", "cat8"] as const;
  const statusKeys = ["ok", "warn", "bad"] as const;

  it.each(
    (["LIGHT", "DARK"] as const).flatMap((themeName) => {
      const theme = themeName === "LIGHT" ? LIGHT : DARK;
      return cats.flatMap((cat) =>
        statusKeys.map((status) => [
          `${themeName.toLowerCase()} ${cat} vs ${status}`,
          hueDegrees(theme[cat]),
          hueDegrees(theme[status]),
        ] as const)
      );
    })
  )("%s >= 25°", (_label, catHue, statusHue) => {
    expect(hueDistance(catHue, statusHue)).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);
  });
});

/**
 * T160 (WP-P1): every tinted-chip / tinted-pill pairing in the shell and the
 * new screens. `merged` PrChip is `bg-define/10 text-define-ink`; the tint is
 * composited over each surface it can sit on (surface, bg, surface-2,
 * primary-soft) and the worst case must clear AA. Also primary on
 * primary-soft (FilterChips / TimelineStrip / tab pills), muted on surface-2
 * (inactive chips, hover), primary on surface (PrChip open), and the warn /
 * ink on surface-2 (StatusPill count; raw --c-run text failed there).
 */
function mixHex(fg: string, base: string, alpha: number): string {
  const c = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, b] = [c(fg), c(base)];
  return "#" + f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}

describe("tinted chip pairs (T160, WCAG AA, ratio >= 4.5:1)", () => {
  const themes = { light: LIGHT, dark: DARK } as const;
  const rows = (["light", "dark"] as const).flatMap((name) => {
    const t = themes[name];
    const bases = { surface: t.surface, bg: t.bg, surface2: t.surface2, primarySoft: t.primarySoft };
    return [
      ...Object.entries(bases).map(
        ([baseName, base]) => [`${name} define-ink on define/10 over ${baseName} (PrChip merged)`, t.defineInk, mixHex(t.define, base, 0.1)] as const,
      ),
      [`${name} primary/primary-soft (FilterChips, TimelineStrip, tab pills)`, t.primary, t.primarySoft] as const,
      [`${name} primary/surface (PrChip open, FilterChips border)`, t.primary, t.surface] as const,
      [`${name} muted/surface-2 (inactive chips, hover)`, t.muted, t.surface2] as const,
      [`${name} muted/bg`, t.muted, t.bg] as const,
      [`${name} ink/surface-2 (StatusPill count)`, t.ink, t.surface2] as const,
    ];
  });

  it.each(rows)("%s", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
