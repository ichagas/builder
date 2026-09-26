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
  ink: "#0F1D35",
  muted: "#4F5F78",
  primary: "#2451D6",
  primaryForeground: "#FFFFFF",
  ok: "#13803D",
  warn: "#B45309",
  bad: "#C0262D",
};

const DARK = {
  bg: "#0E1626",
  surface: "#142036",
  ink: "#E9EEF7",
  muted: "#9FB0CC",
  primary: "#6C93FF",
  primaryForeground: "#0B1830",
  ok: "#3DDC84",
  warn: "#F2A93B",
  bad: "#F2807C",
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
