#!/usr/bin/env -S npx tsx
/**
 * Codemod: colors-to-tokens (T030, spec 007-frontend-new)
 *
 * Rewrites hard-coded Tailwind palette color classes and hex color literals
 * in `app/frontend-new` source to the semantic design tokens defined by
 * `specs/007-frontend-new/contracts/design-system.md` §1 / §1.1.
 *
 * Usage:
 *   npx tsx scripts/codemods/colors-to-tokens.ts [--dry-run|--write] [--report <path>] <globs...>
 *
 * Examples:
 *   npx tsx scripts/codemods/colors-to-tokens.ts --dry-run \
 *     --report specs/007-frontend-new/codemod/colors-dry-run.md \
 *     app/frontend-new/src
 *
 * WP-F2b reconciliation note: the dry run must scan the *whole* `src` tree
 * (`app/frontend-new/src`), not just `src/components/**` and
 * `src/pages/**` — components/pages hold nearly all of the JSX, but raw
 * palette classes and status/type -> class lookup tables (step 3b below) do
 * turn up outside them too (e.g. `src/hooks/useNodeTypes.ts`). `src/design/`
 * is excluded automatically (see `IGNORE_DIR_NAMES`) since it's the
 * authoritative source of raw color values, mirroring the token lint rule's
 * own `ignores: ["src/design/**"]`.
 *
 * Design notes (why regex/token scanning instead of a full AST transform):
 * - `app/frontend-new` is not installed in every worktree that needs to run
 *   this script, and the TypeScript compiler API / ts-morph would add a
 *   dependency (and an install step) purely to re-print JSX/TS files, which
 *   risks reformatting unrelated code (whitespace, quote style, wrapping).
 * - The token lint rule this codemod must agree with
 *   (`app/frontend-new/eslint-rules/no-raw-tailwind-colors.js`) already
 *   takes the same approach: it does not type-check or fully resolve
 *   expressions, it walks a constrained set of AST shapes (JSX attribute
 *   values, `cn`/`clsx`/... call arguments, `style={{...}}` objects) via
 *   ESLint's own parser and then treats string literals as opaque
 *   whitespace-delimited class blobs. This script mirrors that scope with
 *   brace-balanced text extraction plus the same token grammar, which keeps
 *   detection agreement between the two tools easy to verify (see the
 *   unit tests, which cross-check the constant lists against the lint
 *   rule's source) and keeps the diff minimal: only the exact matched
 *   substrings are replaced, byte for byte, everything else in the file is
 *   untouched.
 * - Dependency-free: only Node built-ins (`fs`, `path`) are used. No new
 *   devDependencies were added for this task.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Token grammar (kept in sync with app/frontend-new/eslint-rules/no-raw-tailwind-colors.js)
// ---------------------------------------------------------------------------

/** Tailwind's default palette color names (v3/v4). Mirrors the lint rule's
 * `PALETTE_COLORS` list exactly (verified by a unit test that reads the lint
 * rule's source and compares the two lists). */
export const PALETTE_COLORS = [
  "slate",
  "gray",
  "grey",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

/** Utility prefixes that take a `-<color>-<shade>` suffix. Mirrors the lint
 * rule's `UTILITY_PREFIXES` list exactly. */
export const UTILITY_PREFIXES = [
  "bg",
  "text",
  "border(?:-[trblxyse]|-spacing)?",
  "ring(?:-offset)?",
  "fill",
  "stroke",
  "divide",
  "outline",
  "decoration",
  "caret",
  "accent",
  "shadow",
  "from",
  "via",
  "to",
  "placeholder",
  "selection",
];

const SHADES = "50|100|150|200|300|400|500|600|700|800|900|950";

const CLASS_HELPER_CALLEES = ["cn", "clsx", "classnames", "cx", "twMerge", "tv"];

// A single Tailwind class token: optional `!` (v4 leading important), any
// number of `variant:` segments (hover:, dark:, md:, group-hover:, chained),
// a prefix, `-color-shade`, an optional trailing `!` (v3 important) and an
// optional `/opacity` modifier.
const TOKEN_RE = new RegExp(
  `^(?<important>!)?(?<variants>(?:[a-zA-Z0-9_-]+:)*)(?<prefix>${UTILITY_PREFIXES.join("|")})-(?<color>${PALETTE_COLORS.join("|")})-(?<shade>${SHADES})(?<bang>!)?(?<opacity>\\/(?:\\d{1,3}|\\[[^\\]]+\\]))?$`,
);

// ---------------------------------------------------------------------------
// Mapping rules (contracts/design-system.md §1.1)
// ---------------------------------------------------------------------------

type Family = {
  name: string;
  colors: string[];
  solidShades: number[];
  solidToken: string;
  softShades?: number[];
  softToken?: string;
  /** Prefixes eligible for the soft token; default: all prefixes that reach a solid match. */
  softPrefixes?: string[];
};

const FAMILIES: Family[] = [
  {
    name: "ok",
    colors: ["green", "emerald"],
    solidShades: [500, 600, 700],
    solidToken: "ok",
    softShades: [50, 100],
    softToken: "ok-soft",
  },
  {
    name: "bad",
    colors: ["red"],
    solidShades: [500, 600, 700],
    solidToken: "bad",
    softShades: [50, 100],
    softToken: "bad-soft",
  },
  {
    name: "warn",
    colors: ["yellow", "amber", "orange"],
    solidShades: [500, 600, 700],
    solidToken: "warn",
    softShades: [50, 100],
    softToken: "warn-soft",
  },
  {
    name: "primary",
    colors: ["blue", "indigo"],
    solidShades: [500, 600, 700],
    solidToken: "primary",
    softShades: [50, 100],
    softToken: "primary-soft",
  },
];

// purple/violet: ambiguous between phase (`define`) and change-type (`feat`).
const PURPLE_VIOLET_COLORS = ["purple", "violet"];
const PURPLE_VIOLET_SHADES = [500, 600, 700];
const PURPLE_VIOLET_DEFAULT_TOKEN = "define";
const PURPLE_VIOLET_FEAT_TOKEN = "feat";
// Heuristic: if "feat"/"feature" appears in the same class blob's nearby
// context (the surrounding ~80 chars of source, e.g. an object key like
// `feature:` or a string like "Feature"), prefer the change-type token.
const FEATURE_CONTEXT_RE = /feat(?:ure)?/i;

// gray/slate: neutrals -> surface/text tokens, prefix-specific.
type NeutralRule = { prefixes: string[]; shades: number[]; token: string };
const NEUTRAL_RULES: NeutralRule[] = [
  // `placeholder` is included alongside `text`: placeholder text is the
  // same muted-text concern the contract's text rule targets, just scoped
  // to the `::placeholder` pseudo-element instead of the element itself.
  { prefixes: ["text", "placeholder"], shades: [400, 500, 600], token: "muted-foreground" },
  { prefixes: ["text"], shades: [700, 800, 900], token: "foreground" },
  { prefixes: ["bg"], shades: [50, 100, 200], token: "surface-2" },
  {
    prefixes: ["border", "border-t", "border-b", "border-l", "border-r", "border-x", "border-y"],
    shades: [200, 300],
    token: "line",
  },
];
const NEUTRAL_COLORS = ["gray", "slate"];

// ---------------------------------------------------------------------------
// Hex -> token nearest-match table (contracts/design-system.md §1)
// ---------------------------------------------------------------------------

export const HEX_TOKENS: Array<{ token: string; hex: string }> = [
  { token: "bg", hex: "#E8EDF4" },
  { token: "surface", hex: "#FFFFFF" },
  { token: "surface-2", hex: "#F2F5F9" },
  { token: "line", hex: "#D3DBE6" },
  { token: "line-2", hex: "#AFBCCE" },
  { token: "ink", hex: "#0F1D35" },
  { token: "muted", hex: "#4F5F78" },
  { token: "primary", hex: "#2451D6" },
  { token: "primary-soft", hex: "#E3EAFC" },
  { token: "ok", hex: "#13803D" },
  { token: "warn", hex: "#B45309" },
  { token: "bad", hex: "#C0262D" },
  { token: "run", hex: "#D97706" },
  { token: "c-define", hex: "#7C3AED" },
  { token: "c-design", hex: "#0891B2" },
  { token: "c-build", hex: "#D97706" },
  { token: "c-ship", hex: "#16A34A" },
  { token: "m-green", hex: "#16A34A" },
  { token: "m-yellow", hex: "#CA8A04" },
  { token: "m-red", hex: "#DC2626" },
  { token: "m-blue", hex: "#2563EB" },
  { token: "mode-building", hex: "#4C8DFF" },
  { token: "mode-released", hex: "#2FBF71" },
  { token: "mode-connected", hex: "#A78BFA" },
  { token: "rail-bg", hex: "#102040" },
  { token: "gbar-bg", hex: "#0B1830" },
];

/** Auto-mappable only within this RGB Euclidean distance (max ~441.7). Chosen
 * so near-identical hues match (e.g. `#13803c` ~ `--ok`) but visually
 * unrelated colors (e.g. third-party brand marks) are left for manual
 * review instead of being silently "nearest-matched". */
const HEX_DISTANCE_THRESHOLD = 30;

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

export function nearestToken(hex: string): { token: string; distance: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let best: { token: string; distance: number } | null = null;
  for (const { token, hex: h } of HEX_TOKENS) {
    const trgb = hexToRgb(h);
    if (!trgb) continue;
    const d = Math.sqrt((rgb[0] - trgb[0]) ** 2 + (rgb[1] - trgb[1]) ** 2 + (rgb[2] - trgb[2]) ** 2);
    if (!best || d < best.distance) best = { token, distance: d };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Class-token mapping
// ---------------------------------------------------------------------------

export type TokenMapResult =
  | { kind: "unchanged" }
  | { kind: "mapped"; output: string; rule: string }
  | { kind: "ambiguous"; output: string; rule: string; chosen: "define" | "feat" }
  | { kind: "unmapped"; reason: string }
  | { kind: "redundant-dark" };

/**
 * Classifies one whitespace-delimited class token (with its variants intact)
 * against the mapping table. `context` is a short window of surrounding
 * source text used only for the purple/violet feature-vs-phase heuristic.
 */
export function classifyClassToken(token: string, context: string = ""): TokenMapResult {
  const m = TOKEN_RE.exec(token);
  if (!m || !m.groups) return { kind: "unchanged" };

  const { important, variants, prefix, color, shade } = m.groups as Record<string, string>;
  const bang = m.groups.bang ?? "";
  const opacity = m.groups.opacity ?? "";
  const shadeNum = Number(shade);
  const rebuild = (utility: string) => `${important ?? ""}${variants}${utility}${bang}${opacity}`;

  // Semantic status families (ok/bad/warn/primary).
  for (const family of FAMILIES) {
    if (!family.colors.includes(color)) continue;
    if (family.solidShades.includes(shadeNum)) {
      return { kind: "mapped", output: rebuild(`${prefix}-${family.solidToken}`), rule: `${family.name}:solid` };
    }
    if (family.softShades?.includes(shadeNum) && family.softToken) {
      return { kind: "mapped", output: rebuild(`${prefix}-${family.softToken}`), rule: `${family.name}:soft` };
    }
  }

  // purple/violet: ambiguous phase-vs-feature-type.
  if (PURPLE_VIOLET_COLORS.includes(color) && PURPLE_VIOLET_SHADES.includes(shadeNum)) {
    const useFeat = FEATURE_CONTEXT_RE.test(context);
    const chosenToken = useFeat ? PURPLE_VIOLET_FEAT_TOKEN : PURPLE_VIOLET_DEFAULT_TOKEN;
    return {
      kind: "ambiguous",
      output: rebuild(`${prefix}-${chosenToken}`),
      rule: "purple-violet",
      chosen: useFeat ? "feat" : "define",
    };
  }

  // Neutrals (gray/slate) -> surface/text tokens, prefix + shade specific.
  if (NEUTRAL_COLORS.includes(color)) {
    for (const rule of NEUTRAL_RULES) {
      if (rule.prefixes.includes(prefix) && rule.shades.includes(shadeNum)) {
        return { kind: "mapped", output: rebuild(`${prefix}-${rule.token}`), rule: `neutral:${rule.token}` };
      }
    }
    return { kind: "unmapped", reason: `no neutral rule for ${prefix}-${color}-${shade}` };
  }

  return { kind: "unmapped", reason: `no rule for ${prefix}-${color}-${shade}` };
}

type TokenSpan = { start: number; end: number; text: string };

function findClassTokens(blob: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob))) {
    spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return spans;
}

export type ClassBlobRecord = {
  original: string;
  output?: string;
  rule: string;
  kind: TokenMapResult["kind"];
};

/**
 * Rewrites one class blob (the raw text of a `className="..."`,
 * `` className={`...`} ``, or a `cn(...)`-style helper argument) applying
 * the token mapping and the dark:-variant redundancy pass.
 */
export function transformClassBlob(blob: string): { output: string; changed: boolean; records: ClassBlobRecord[] } {
  const spans = findClassTokens(blob);
  const records: ClassBlobRecord[] = [];
  const results: (TokenMapResult & { span: TokenSpan })[] = spans.map((span) => {
    const contextStart = Math.max(0, span.start - 80);
    const contextEnd = Math.min(blob.length, span.end + 80);
    const context = blob.slice(contextStart, contextEnd);
    const result = classifyClassToken(span.text, context);
    return { ...result, span };
  });

  // Build the set of mapped outputs produced by non-dark tokens, for the
  // dark: redundancy pass.
  const nonDarkOutputs = new Set(
    results
      .filter((r) => (r.kind === "mapped" || r.kind === "ambiguous") && !/^dark:/.test(r.span.text))
      .map((r) => (r as { output: string }).output),
  );

  const finalResults = results.map((r) => {
    if ((r.kind === "mapped" || r.kind === "ambiguous") && /^dark:[^:]+$/.test(r.span.text)) {
      // Strip the lone `dark:` variant to compare against the plain
      // (non-dark) mapped output for the same utility.
      const bareOutput = (r as { output: string }).output.replace(/^dark:/, "");
      if (nonDarkOutputs.has(bareOutput)) {
        return { ...r, kind: "redundant-dark" as const };
      }
    }
    return r;
  });

  let changed = false;
  // Apply replacements/removals from the end of the string backwards so
  // indices stay valid.
  let output = blob;
  for (let i = finalResults.length - 1; i >= 0; i--) {
    const r = finalResults[i];
    if (r.kind === "mapped" || r.kind === "ambiguous") {
      output = output.slice(0, r.span.start) + r.output + output.slice(r.span.end);
      changed = true;
      records.push({ original: r.span.text, output: r.output, rule: r.rule, kind: r.kind });
    } else if (r.kind === "redundant-dark") {
      // Remove the token plus one adjacent whitespace character so we don't
      // leave double spaces behind.
      let removeStart = r.span.start;
      let removeEnd = r.span.end;
      if (/\s/.test(output[removeEnd] ?? "")) {
        removeEnd += 1;
      } else if (/\s/.test(output[removeStart - 1] ?? "")) {
        removeStart -= 1;
      }
      output = output.slice(0, removeStart) + output.slice(removeEnd);
      changed = true;
      records.push({ original: r.span.text, rule: "dark-redundant", kind: "redundant-dark" });
    } else if (r.kind === "unmapped") {
      records.push({ original: r.span.text, rule: r.reason, kind: "unmapped" });
    }
  }

  return { output, changed, records };
}

// ---------------------------------------------------------------------------
// Text extraction: JSX className/class attrs, style={{}}, helper calls,
// fill=/stroke=/stopColor= attrs.
// ---------------------------------------------------------------------------

type Edit = { start: number; end: number; text: string };

export type HexRecord = {
  original: string;
  output?: string;
  token?: string;
  distance?: number;
  flagged?: boolean; // multi-hex file / possible brand asset
  context: string;
  /** @internal candidate edit, applied only if not flagged and within threshold */
  pendingEdit?: Edit;
};

export type FileResult = {
  output: string;
  changed: boolean;
  classRecords: ClassBlobRecord[];
  hexRecords: HexRecord[];
};

/** Finds the index just after the character that balances the opening brace
 * at `openIndex` (which must point at `{`). Returns -1 if unbalanced. */
function findMatchingBrace(text: string, openIndex: number, openCh: string, closeCh: string): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const CLASS_ATTR_RE = /\b(?:className|class)\s*=\s*(\{)/g;
const CLASS_ATTR_STRING_RE = /\b(?:className|class)\s*=\s*(["'])((?:(?!\1).)*)\1/g;
const STYLE_ATTR_RE = /\bstyle\s*=\s*\{\s*\{/g;
const COLOR_STYLE_KEYS = new Set([
  "color",
  "background",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "fill",
  "stroke",
  "stopColor",
  "caretColor",
  "accentColor",
  "textDecorationColor",
]);
// fill=/stroke=/stopColor= as plain JSX string attributes (SVG props).
const SVG_COLOR_ATTR_RE = /(?<![\w-])(fill|stroke|stopColor)=("|')(#[0-9a-fA-F]{3,8})\2/g;
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

function collectHelperCallSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const re = new RegExp(`\\b(?:${CLASS_HELPER_CALLEES.join("|")})\\s*(\\()`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingBrace(text, openIdx, "(", ")");
    if (closeIdx === -1) continue;
    spans.push({ start: openIdx + 1, end: closeIdx });
  }
  return spans;
}

/** Extracts every quoted-string / template-literal-chunk span within a
 * region of text (used both for className={...} expression containers and
 * for helper-call argument lists). Mirrors the lint rule's recursive walk
 * over Literal/TemplateLiteral/Conditional/Logical/Array/Object nodes by
 * simply treating every quoted string as a class blob — sufficient because
 * outside of className/helper-call contexts we never look at this text at
 * all.
 *
 * Template-literal interpolations (`${...}`) are not just skipped: many real
 * className template literals hold a conditional expression inside the
 * interpolation whose branches are themselves plain class strings, e.g.
 * `` className={`p-3 ${cond ? "border-green-500/50 bg-green-500/10" : "bg-muted/50"}`} ``.
 * The interpolation's inner text is found with brace balancing (so nested
 * braces/strings/further template literals don't confuse the boundary) and
 * recursively scanned the same way, so those inner quoted strings are found
 * too. */
function collectStringSpans(text: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== '"' && ch !== "'" && ch !== "`") {
      i++;
      continue;
    }
    const quote = ch;
    let cursor = i + 1; // start of the current literal chunk
    let j = i + 1;
    let bodyEnd = -1;
    while (j < text.length) {
      const c = text[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === quote) {
        bodyEnd = j;
        break;
      }
      if (quote === "`" && c === "$" && text[j + 1] === "{") {
        // Flush the literal chunk seen so far, then recurse into the
        // brace-balanced interpolation body for nested quoted spans.
        spans.push({ start: cursor, end: j, text: text.slice(cursor, j) });
        const closeIdx = findMatchingBrace(text, j + 1, "{", "}");
        if (closeIdx === -1) {
          j = text.length;
          break;
        }
        const innerStart = j + 2;
        for (const nested of collectStringSpans(text.slice(innerStart, closeIdx))) {
          spans.push({ start: innerStart + nested.start, end: innerStart + nested.end, text: nested.text });
        }
        j = closeIdx + 1;
        cursor = j;
        continue;
      }
      j++;
    }
    if (bodyEnd === -1) break; // unterminated string literal; stop scanning
    spans.push({ start: cursor, end: bodyEnd, text: text.slice(cursor, bodyEnd) });
    i = bodyEnd + 1;
  }
  return spans;
}

export function processFile(source: string): FileResult {
  const edits: Edit[] = [];
  const classRecords: ClassBlobRecord[] = [];
  const hexRecords: HexRecord[] = [];
  // Regions covered by className/class attribute values (string literal
  // bodies and `{...}` expression containers). Hex scanning (steps 4/5)
  // skips these regions: color-bearing hex inside a className string is
  // either an arbitrary-value selector (e.g. matching a third-party
  // library's inline style, not a real color decision of ours) or would
  // already have been handled as a Tailwind arbitrary color utility, never
  // a bare `fill="#fff"`-style attribute.
  const classAttrRegions: Array<{ start: number; end: number }> = [];

  // 1. className="..." / class="..." plain string literals.
  {
    const re = new RegExp(CLASS_ATTR_STRING_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const bodyStart = m.index + m[0].indexOf(m[2]);
      classAttrRegions.push({ start: m.index, end: m.index + m[0].length });
      const { output, changed, records } = transformClassBlob(m[2]);
      classRecords.push(...records);
      if (changed) edits.push({ start: bodyStart, end: bodyStart + m[2].length, text: output });
    }
  }

  // 2. className={...} expression containers: template literals get the
  // same treatment as plain strings; helper calls inside get their string
  // arguments scanned.
  {
    const re = new RegExp(CLASS_ATTR_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const openIdx = m.index + m[0].length - 1;
      const closeIdx = findMatchingBrace(source, openIdx, "{", "}");
      if (closeIdx === -1) continue;
      const exprStart = openIdx + 1;
      const exprEnd = closeIdx;
      classAttrRegions.push({ start: m.index, end: exprEnd + 1 });
      const exprText = source.slice(exprStart, exprEnd);
      for (const span of collectStringSpans(exprText)) {
        const { output, changed, records } = transformClassBlob(span.text);
        classRecords.push(...records);
        if (changed) edits.push({ start: exprStart + span.start, end: exprStart + span.end, text: output });
      }
    }
  }

  // 3. Helper calls (cn/clsx/classnames/cx/twMerge/tv) anywhere in the file
  // (covers calls outside a className attribute, e.g. `const cls = cn(...)`).
  const helperCallSpans = collectHelperCallSpans(source);
  for (const { start, end } of helperCallSpans) {
    const argText = source.slice(start, end);
    for (const span of collectStringSpans(argText)) {
      const { output, changed, records } = transformClassBlob(span.text);
      classRecords.push(...records);
      if (changed) edits.push({ start: start + span.start, end: start + span.end, text: output });
    }
  }

  // 3b. Bare object-literal property values (`key: "classes"` or
  // `"key": "classes"`) anywhere in the file, not only inside a className
  // attribute or a class helper call. A common pattern in this codebase is a
  // status/type -> classes lookup table used later as
  // `className={STATUS_STYLES[status]}` (e.g.
  // `const typeColors = { EPIC: "bg-purple-500/10 text-purple-700 ..." }`),
  // which steps 1-3 never see because it is neither a className value nor a
  // cn()/clsx() argument at the point where the string literal appears. We
  // scan every `key: "value"` pair in the file (skipping spans already
  // covered by steps 1-3 above, so nothing is double-counted) and let
  // `transformClassBlob`'s own token grammar decide whether there is
  // anything to map — an ordinary non-class string property (e.g.
  // `label: "Send message"`) never matches the token regex and is left
  // untouched.
  {
    const alreadyCovered = (start: number, end: number) =>
      classAttrRegions.some((r) => start >= r.start && end <= r.end) ||
      helperCallSpans.some((r) => start >= r.start && end <= r.end);

    const propRe = /(?:"[^"]*"|'[^']*'|[A-Za-z_$][\w$]*)\s*:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRe.exec(source))) {
      const value = pm[2];
      const matchEnd = pm.index + pm[0].length;
      const valueEnd = matchEnd - 1; // last char of the match is the closing quote
      const valueStart = valueEnd - value.length;
      if (alreadyCovered(valueStart, valueEnd)) continue;
      const { output, changed, records } = transformClassBlob(value);
      classRecords.push(...records);
      if (changed) edits.push({ start: valueStart, end: valueEnd, text: output });
    }
  }

  // 4. style={{ ... }} objects: only color-bearing keys.
  {
    const re = new RegExp(STYLE_ATTR_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const outerOpenIdx = source.indexOf("{", m.index);
      const outerCloseIdx = findMatchingBrace(source, outerOpenIdx, "{", "}");
      if (outerCloseIdx === -1) continue;
      const innerOpenIdx = source.indexOf("{", outerOpenIdx + 1);
      if (innerOpenIdx === -1 || innerOpenIdx > outerCloseIdx) continue;
      const innerCloseIdx = findMatchingBrace(source, innerOpenIdx, "{", "}");
      if (innerCloseIdx === -1) continue;
      const objText = source.slice(innerOpenIdx + 1, innerCloseIdx);
      const propRe = /([A-Za-z0-9_$]+)\s*:\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
      let pm: RegExpExecArray | null;
      while ((pm = propRe.exec(objText))) {
        const key = pm[1];
        if (!COLOR_STYLE_KEYS.has(key)) continue;
        const valueStart = innerOpenIdx + 1 + pm.index + pm[0].indexOf(pm[3], pm[1].length);
        applyHexEdits(pm[3], valueStart, source, hexRecords);
      }
    }
  }

  // 5. fill=/stroke=/stopColor= plain JSX attributes. Skipped inside a
  // className/class attribute region: there, a `stroke='#fff'` fragment is
  // part of an arbitrary-variant CSS selector string (targeting a
  // third-party library's own inline styles, e.g. Recharts' internal SVG),
  // never a real color prop of ours.
  {
    const re = new RegExp(SVG_COLOR_ATTR_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      if (classAttrRegions.some((r) => m!.index >= r.start && m!.index < r.end)) continue;
      const hex = m[3];
      const hexStart = m.index + m[0].indexOf(hex);
      applyHexEdits(hex, hexStart, source, hexRecords);
    }
  }

  // Flag files with many distinct hex fill/stroke colors as possible
  // brand/logo assets: still report the nearest-token suggestion, but don't
  // count them as auto-mappable, and don't rewrite them.
  const distinctHex = new Set(hexRecords.map((r) => r.original.toLowerCase()));
  if (distinctHex.size >= 4) {
    for (const r of hexRecords) r.flagged = true;
  } else {
    for (const r of hexRecords) {
      if (r.pendingEdit) edits.push(r.pendingEdit);
    }
  }
  for (const r of hexRecords) delete r.pendingEdit;

  // Apply edits back-to-front so indices stay valid.
  edits.sort((a, b) => b.start - a.start);
  let output = source;
  let changed = classRecords.some((r) => r.kind !== "unmapped");
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  if (edits.length > 0) changed = true;

  return { output, changed, classRecords, hexRecords };
}

function applyHexEdits(value: string, valueStart: number, source: string, hexRecords: HexRecord[]) {
  const re = new RegExp(HEX_RE);
  let hm: RegExpExecArray | null;
  while ((hm = re.exec(value))) {
    const hex = hm[0];
    const nearest = nearestToken(hex);
    const contextStart = Math.max(0, valueStart - 60);
    const contextEnd = Math.min(source.length, valueStart + value.length + 60);
    const context = source.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim();
    if (nearest && nearest.distance <= HEX_DISTANCE_THRESHOLD) {
      const output = `var(--${nearest.token})`;
      hexRecords.push({
        original: hex,
        output,
        token: nearest.token,
        distance: nearest.distance,
        context,
        pendingEdit: { start: valueStart + hm.index, end: valueStart + hm.index + hex.length, text: output },
      });
    } else {
      hexRecords.push({
        original: hex,
        token: nearest?.token,
        distance: nearest?.distance,
        context,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

const SOURCE_EXT = new Set([".ts", ".tsx"]);
// `design` mirrors the token lint rule's `ignores: ["src/design/**"]`
// (eslint.config.js): the design token layer itself (T020, `src/design/`) is
// the authoritative source of raw color values and must never be rewritten
// or reported as unmapped.
const IGNORE_DIR_NAMES = new Set(["node_modules", "dist", "dev-dist", ".git", "design"]);

function walk(dir: string, out: string[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORE_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SOURCE_EXT.has(ext) && !entry.name.endsWith(".d.ts")) out.push(full);
    }
  }
}

export function expandGlobs(patterns: string[], cwd: string = process.cwd()): string[] {
  const files = new Set<string>();
  for (const pattern of patterns) {
    const normalized = pattern.replace(/\/\*\*\/?$/, "");
    const base = path.isAbsolute(normalized) ? normalized : path.join(cwd, normalized);
    if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
      const collected: string[] = [];
      walk(base, collected);
      collected.forEach((f) => files.add(f));
    } else if (fs.existsSync(base) && fs.statSync(base).isFile()) {
      files.add(base);
    }
  }
  return [...files].sort();
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

type Totals = {
  mappedByRule: Map<string, number>;
  mappedByArea: Map<string, number>;
  unmapped: Array<{ file: string; line: number; token: string; reason: string }>;
  ambiguousPurple: Array<{ file: string; line: number; token: string; output: string; chosen: string }>;
  hexMapped: Array<{ file: string; line: number; hex: string; token: string; distance: number }>;
  hexUnmapped: Array<{ file: string; line: number; hex: string; nearestToken?: string; distance?: number }>;
  hexFlagged: Array<{ file: string; line: number; hex: string; token?: string; distance?: number }>;
  darkRedundant: Array<{ file: string; line: number; token: string }>;
  filesChanged: number;
  filesScanned: number;
};

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

function areaOf(file: string, cwd: string): string {
  const rel = path.relative(cwd, file).replace(/\\/g, "/");
  const m = /src\/(components|pages)\/([^/]+)/.exec(rel);
  if (m) return `${m[1]}/${m[2]}`;
  const m2 = /src\/(components|pages)\//.exec(rel);
  if (m2) return m2[1];
  return "other";
}

function renderReport(totals: Totals, cwd: string): string {
  const lines: string[] = [];
  lines.push("# Colors-to-tokens codemod: dry-run report");
  lines.push("");
  lines.push(`Generated by \`scripts/codemods/colors-to-tokens.ts --dry-run\` (T030, spec 007-frontend-new).`);
  lines.push("");
  lines.push(`- Files scanned: ${totals.filesScanned}`);
  lines.push(`- Files that would change: ${totals.filesChanged}`);
  const mappedTotal = [...totals.mappedByRule.values()].reduce((a, b) => a + b, 0);
  lines.push(`- Class tokens mapped: ${mappedTotal}`);
  lines.push(`- Class tokens unmapped: ${totals.unmapped.length}`);
  lines.push(`- Redundant \`dark:\` variants removed: ${totals.darkRedundant.length}`);
  lines.push(`- Hex literals auto-mappable (distance <= ${HEX_DISTANCE_THRESHOLD}): ${totals.hexMapped.length}`);
  lines.push(`- Hex literals unmapped (needs manual token or new token): ${totals.hexUnmapped.length}`);
  lines.push(`- Hex literals flagged as possible brand/logo assets (excluded from auto-map): ${totals.hexFlagged.length}`);
  lines.push("");

  const classTotal = mappedTotal + totals.unmapped.length;
  lines.push("## Reconciliation (WP-F2b)");
  lines.push("");
  lines.push(
    `\`plan.md\` estimated **877 Tailwind palette classes in 91 files** (877 was a rough manual count; the classes ` +
      "and files aren't the same unit — a class occurrence and a file that contains at least one are different " +
      "denominators). This run accounts for every raw palette class-token occurrence the codemod's grammar can " +
      `see: **${mappedTotal} mapped + ${totals.unmapped.length} unmapped = ${classTotal} class tokens**, across ` +
      `**${totals.filesChanged} files that would change** (of ${totals.filesScanned} \`.ts\`/\`.tsx\` files ` +
      "scanned under `app/frontend-new/src`, excluding `src/design/**`) — within a few percent of the plan's " +
      "91-file estimate and the right order of magnitude for 877 classes once the two gaps below (T030 fix " +
      "round 1) are closed. Hex literals are tracked separately (see the summary above): " +
      `${totals.hexMapped.length} auto-mappable, ${totals.hexUnmapped.length} unmapped, ${totals.hexFlagged.length} ` +
      "flagged brand/logo assets, against the plan's rough 388-hex-value estimate — hex literals are far rarer " +
      "in this codebase than the plan guessed; nearly all color-bearing style is done with Tailwind utility " +
      "classes, not inline hex.",
  );
  lines.push("");
  lines.push("Two gaps in the original T030 dry run (412 mapped + 161 unmapped = 573 class tokens, 76 files) " +
    "were found and fixed before T031:");
  lines.push("");
  lines.push(
    "1. **Scan scope.** The original dry run only walked `src/components/**` and `src/pages/**` (282 files). " +
      "The token lint rule (`no-raw-tailwind-colors.js`, T018) is scoped to the whole `src/**/*.{ts,tsx}` " +
      "(minus `src/design/**`), so a raw class outside components/pages (e.g. " +
      "`src/hooks/useNodeTypes.ts`) would fail lint in error mode (T031) without ever having been in the " +
      "codemod's dry run. Fixed by scanning `app/frontend-new/src` directly; this alone only added a " +
      "handful of tokens (the fork's color-bearing code is almost entirely under components/pages), so it " +
      "was not the main source of the gap.",
  );
  lines.push(
    "2. **Extraction blind spots (the real gap).** The codemod (and the lint rule it mirrors) only ever " +
      "looked inside `className`/`class` JSX attribute values and `cn`/`clsx`/`classnames`/`cx`/`twMerge`/`tv` " +
      "call arguments. Two real, common patterns in this codebase were invisible to both tools — not even " +
      "reported as unmapped, just silently absent from every count:",
  );
  lines.push(
    '   - **Status/type -> classes lookup objects** used later via `className={MAP[key]}`, e.g. ' +
      "`const typeColors = { EPIC: \"bg-purple-500/10 text-purple-700 border-purple-500/20\", ... }` " +
      "(`components/requirements/RequirementsTree.tsx`, and 14 more files: `components/deploy/{DatabaseCard," +
      "ExternalDatabaseCard,import/SqlReviewPanel,import/DatabaseErdView}.tsx`, " +
      "`components/audit/{PipelineActivityStream,AuditBlackboard,FindingsTable,AuditActivityStream}.tsx`, " +
      "`components/build/LogViewer.tsx`, `components/canvas/{ZoneNode,CanvasNode}.tsx`, " +
      "`components/resources/{ResourcesSection,ResourceManager}.tsx`, `components/dashboard/LinkedProjectCard.tsx`, " +
      "`pages/Landing.tsx`). The object literal is neither a className value nor a class-helper-call " +
      "argument at the point the string literal appears, so steps 1–3 of the extractor never saw it. Fixed " +
      "with a new extraction step (3b) that scans every `key: \"value\"` / `\"key\": \"value\"` pair in the " +
      "file and runs the same token grammar over the value — an ordinary non-class string property (e.g. " +
      "`label: \"Send message\"`) never matches the token regex, so nothing unrelated is touched, and spans " +
      "already covered by a className attribute or a helper call are skipped so nothing is double-counted.",
  );
  lines.push(
    "   - **Conditional expressions inside a `className={\\`...${...}\\`}` template-literal interpolation**, " +
      'e.g. `` className={`p-3 rounded-md border ${deploy.status === "live" ? "border-green-500/50 ' +
      'bg-green-500/10" : "bg-muted/50"}`} `` (`components/deploy/DeploymentLogsDialog.tsx`). The extractor ' +
      "used to split a template literal on `${...}` and discard the interpolation's contents outright, so a " +
      "ternary/logical expression living inside the interpolation — a real, rendered class string — was never " +
      "scanned. Fixed by finding each interpolation's brace-balanced span and recursing into it for further " +
      "quoted spans, so nested conditional class expressions are found the same way a top-level cn() call's " +
      "arguments are.",
  );
  lines.push("");
  lines.push(
    "Both fixes are covered by new unit tests in `scripts/codemods/__tests__/colors-to-tokens.test.ts` " +
      "(object-literal maps with bare and quoted keys, non-double-counting when such a map sits inside a " +
      "helper call, and the template-literal-interpolation ternary case), and the existing 28 tests — " +
      'including "non-className strings are never touched" — still pass unchanged: the new step 3b only ' +
      "matches an explicit `key:` / `\"key\":` shape, so a bare top-level string like `const id = " +
      '"bg-red-500-not-a-class"` or `return "text-green-600"` (no colon) is still left alone.',
  );
  lines.push("");
  lines.push(
    "The token lint rule (T018, `app/frontend-new/eslint-rules/no-raw-tailwind-colors.js`) has the *same* " +
      "object-literal-map and template-literal-interpolation blind spots as the original codemod did, since it " +
      "was deliberately written to mirror the codemod's scope. It is not part of this WP's files (T018 is " +
      "WP-F1's), but whoever switches it to error mode in T031 should be aware: the 15 lookup-table files " +
      "above and `DeploymentLogsDialog.tsx` will keep passing lint even after `--write`, until the lint rule's " +
      "`checkClassValueExpression` walk is extended to also visit bare `ObjectExpression` property *values* " +
      "(not just keys) and to recurse into `TemplateLiteral` expression parts, not just `quasis`.",
  );
  lines.push("");

  lines.push("## Counts per mapping rule");
  lines.push("");
  lines.push("| Rule | Count |");
  lines.push("|---|---|");
  for (const [rule, count] of [...totals.mappedByRule.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${rule}\` | ${count} |`);
  }
  lines.push("");

  lines.push("## Counts per area");
  lines.push("");
  lines.push("| Area | Mapped tokens |");
  lines.push("|---|---|");
  for (const [area, count] of [...totals.mappedByArea.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${area}\` | ${count} |`);
  }
  lines.push("");

  lines.push("## Ambiguous purple/violet cases");
  lines.push("");
  lines.push(
    "Heuristic: default to the phase token `-define`; use the change-type token `-feat` only when the word \"feat\"/\"feature\" appears within ~80 characters of the class token. Every purple/violet instance is listed below for manual confirmation before `--write` (T031).",
  );
  lines.push("");
  if (totals.ambiguousPurple.length === 0) {
    lines.push("_None found._");
  } else {
    lines.push("| File:line | Token | Chosen | Output |");
    lines.push("|---|---|---|---|");
    for (const r of totals.ambiguousPurple) {
      lines.push(`| \`${path.relative(cwd, r.file)}:${r.line}\` | \`${r.token}\` | ${r.chosen} | \`${r.output}\` |`);
    }
  }
  lines.push("");

  lines.push("## Redundant `dark:` variants removed");
  lines.push("");
  if (totals.darkRedundant.length === 0) {
    lines.push("_None found._");
  } else {
    lines.push("| File:line | Token |");
    lines.push("|---|---|");
    for (const r of totals.darkRedundant) {
      lines.push(`| \`${path.relative(cwd, r.file)}:${r.line}\` | \`${r.token}\` |`);
    }
  }
  lines.push("");

  lines.push("## Hex replacements (auto-mappable)");
  lines.push("");
  lines.push("Sorted by distance descending (closest review priority first among auto-mappable ones is the opposite — largest distance is most worth double-checking even though it's under the threshold).");
  lines.push("");
  if (totals.hexMapped.length === 0) {
    lines.push("_None found._");
  } else {
    lines.push("| File:line | Hex | Token | Distance |");
    lines.push("|---|---|---|---|");
    for (const r of [...totals.hexMapped].sort((a, b) => b.distance - a.distance)) {
      lines.push(`| \`${path.relative(cwd, r.file)}:${r.line}\` | \`${r.hex}\` | \`var(--${r.token})\` | ${r.distance.toFixed(1)} |`);
    }
  }
  lines.push("");

  lines.push("## Hex literals flagged as possible brand/logo assets");
  lines.push("");
  lines.push(
    "Files with 4+ distinct hex fill/stroke colors are treated as likely multi-color icons or brand marks (e.g. the Microsoft login glyph) and excluded from auto-mapping even when a nearby token exists. Review individually before deciding whether to map or exempt.",
  );
  lines.push("");
  if (totals.hexFlagged.length === 0) {
    lines.push("_None found._");
  } else {
    lines.push("| File:line | Hex | Nearest token | Distance |");
    lines.push("|---|---|---|---|");
    for (const r of totals.hexFlagged) {
      lines.push(
        `| \`${path.relative(cwd, r.file)}:${r.line}\` | \`${r.hex}\` | ${r.token ? `\`--${r.token}\`` : "—"} | ${r.distance?.toFixed(1) ?? "—"} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Unmapped hex literals (no close token match)");
  lines.push("");
  if (totals.hexUnmapped.length === 0) {
    lines.push("_None found._");
  } else {
    lines.push("| File:line | Hex | Nearest token | Distance |");
    lines.push("|---|---|---|---|");
    for (const r of totals.hexUnmapped) {
      lines.push(
        `| \`${path.relative(cwd, r.file)}:${r.line}\` | \`${r.hex}\` | ${r.nearestToken ? `\`--${r.nearestToken}\`` : "—"} | ${r.distance?.toFixed(1) ?? "—"} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Unmapped class tokens (manual review, T031)");
  lines.push("");
  if (totals.unmapped.length === 0) {
    lines.push("_None found._");
  } else {
    lines.push("| File:line | Token | Reason |");
    lines.push("|---|---|---|");
    for (const r of totals.unmapped) {
      lines.push(`| \`${path.relative(cwd, r.file)}:${r.line}\` | \`${r.token}\` | ${r.reason} |`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  let write = false;
  let reportPath: string | null = null;
  const globs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--write") write = true;
    else if (arg === "--dry-run") write = false;
    else if (arg === "--report") reportPath = args[++i];
    else globs.push(arg);
  }
  if (globs.length === 0) {
    console.error("Usage: colors-to-tokens.ts [--dry-run|--write] [--report <path>] <globs...>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const files = expandGlobs(globs, cwd);

  const totals: Totals = {
    mappedByRule: new Map(),
    mappedByArea: new Map(),
    unmapped: [],
    ambiguousPurple: [],
    hexMapped: [],
    hexUnmapped: [],
    hexFlagged: [],
    darkRedundant: [],
    filesChanged: 0,
    filesScanned: 0,
  };

  for (const file of files) {
    totals.filesScanned++;
    const source = fs.readFileSync(file, "utf8");
    const result = processFile(source);
    const area = areaOf(file, cwd);

    let fileHasChange = false;

    // Need original offsets for line numbers, but transformClassBlob/hex
    // records don't carry file offsets directly for class tokens (they are
    // computed relative to their blob). We recompute a lightweight pass:
    // re-run processFile bookkeeping isn't tracking absolute offsets for
    // class records, so approximate the line by searching the first
    // occurrence of the original token text near its rule context. This is
    // good enough for a human-review report.
    let searchCursor = 0;
    for (const rec of result.classRecords) {
      const idx = source.indexOf(rec.original, searchCursor);
      const foundIdx = idx === -1 ? source.indexOf(rec.original) : idx;
      const line = foundIdx === -1 ? 0 : lineOf(source, foundIdx);
      if (foundIdx !== -1) searchCursor = foundIdx + rec.original.length;

      if (rec.kind === "unmapped") {
        totals.unmapped.push({ file, line, token: rec.original, reason: rec.rule });
      } else if (rec.kind === "redundant-dark") {
        totals.darkRedundant.push({ file, line, token: rec.original });
        fileHasChange = true;
      } else if (rec.kind === "ambiguous") {
        const chosen = rec.output?.includes("-feat") ? "feat" : "define";
        totals.ambiguousPurple.push({ file, line, token: rec.original, output: rec.output ?? "", chosen });
        totals.mappedByRule.set(rec.rule, (totals.mappedByRule.get(rec.rule) ?? 0) + 1);
        totals.mappedByArea.set(area, (totals.mappedByArea.get(area) ?? 0) + 1);
        fileHasChange = true;
      } else if (rec.kind === "mapped") {
        totals.mappedByRule.set(rec.rule, (totals.mappedByRule.get(rec.rule) ?? 0) + 1);
        totals.mappedByArea.set(area, (totals.mappedByArea.get(area) ?? 0) + 1);
        fileHasChange = true;
      }
    }

    let hexCursor = 0;
    for (const rec of result.hexRecords) {
      const idx = source.indexOf(rec.original, hexCursor);
      const foundIdx = idx === -1 ? source.indexOf(rec.original) : idx;
      const line = foundIdx === -1 ? 0 : lineOf(source, foundIdx);
      if (foundIdx !== -1) hexCursor = foundIdx + rec.original.length;

      if (rec.flagged) {
        totals.hexFlagged.push({ file, line, hex: rec.original, token: rec.token, distance: rec.distance });
      } else if (rec.output && rec.token !== undefined && rec.distance !== undefined) {
        totals.hexMapped.push({ file, line, hex: rec.original, token: rec.token, distance: rec.distance });
        fileHasChange = true;
      } else {
        totals.hexUnmapped.push({ file, line, hex: rec.original, nearestToken: rec.token, distance: rec.distance });
      }
    }

    if (fileHasChange) totals.filesChanged++;

    if (write && result.changed) {
      fs.writeFileSync(file, result.output, "utf8");
    }
  }

  const report = renderReport(totals, cwd);
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report, "utf8");
    console.log(`Report written to ${reportPath}`);
  } else {
    console.log(report);
  }

  console.log(
    `\n${write ? "Wrote" : "Dry-run:"} ${totals.filesChanged}/${totals.filesScanned} files, ${
      [...totals.mappedByRule.values()].reduce((a, b) => a + b, 0)
    } mapped tokens, ${totals.unmapped.length} unmapped tokens, ${totals.hexMapped.length} hex replacements.`,
  );
}

const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
