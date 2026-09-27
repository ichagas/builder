/**
 * WCAG 2.x contrast-ratio helper (T020 acceptance: verify token pairs are
 * readable in both themes). Pure functions, no DOM dependency, so they can
 * run in a unit test and (later) any lint/CI script.
 */

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: RGB): number {
  const [rl, gl, bl] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** Contrast ratio between two hex colors, per WCAG 2.x (1..21). */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal text. */
export const AA_TEXT = 4.5;

/**
 * Hue angle (0..360°) of a hex color on the HSL color wheel. Used to check
 * that the categorical palette's hues (contracts/design-system.md §1.2)
 * stay far enough from the status hues (--ok/--warn/--bad) to never read as
 * a status color by coincidence (WP-F2b fix round 2, item 2).
 */
export function hueDegrees(hex: string): number {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d) % 6; break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Shortest distance between two hue angles on the 360° color wheel. */
export function hueDistance(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return Math.min(d, 360 - d);
}
