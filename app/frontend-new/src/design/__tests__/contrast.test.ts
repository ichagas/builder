import { describe, expect, it } from "vitest";
import { AA_TEXT, contrastRatio } from "../contrast";

/**
 * T020 acceptance: contrast OK in light and dark. Hex values below are a
 * literal mirror of src/design/tokens.css (kept in sync manually — this
 * file lives in src/design/**, which the token-lint rule exempts).
 */
const LIGHT = {
  bg: "#E8EDF4",
  surface: "#FFFFFF",
  surface2: "#F2F5F9",
  ink: "#0F1D35",
  muted: "#4F5F78",
  primary: "#2451D6",
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
  ink: "#E9EEF7",
  muted: "#9FB0CC",
  primary: "#6C93FF",
  primaryForeground: "#0B1830",
  ok: "#3DDC84",
  okSoft: "#123626",
  warn: "#F2A93B",
  warnSoft: "#3A2B12",
  bad: "#F2807C",
  badSoft: "#3A1720",
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
