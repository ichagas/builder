#!/usr/bin/env node
// Sanity check for WP-F2b (T031): for every changed .ts/.tsx file under
// app/frontend-new/src between feature/frontend-new and wp/F2b, strip
// comments, mask className content, and mask color-bearing literals
// (hex / rgb() / hsl() / var(--...) / bare tailwind color-utility strings)
// from both the base and head versions, then diff what's left. A non-empty
// remaining diff means something besides colors/classnames/comments changed.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE_REF || "feature/frontend-new";
const HEAD = process.env.HEAD_REF || "wp/F2b";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const filesRaw = execFileSync(
  "git",
  ["diff", `${BASE}...${HEAD}`, "--name-only", "--", "app/frontend-new/src/**/*.tsx", "app/frontend-new/src/**/*.ts"],
  { cwd: REPO, encoding: "utf8" }
);
const files = filesRaw.split("\n").filter(Boolean);

function showAt(ref, file) {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], { cwd: REPO, encoding: "utf8" });
  } catch {
    return null;
  }
}

const PREFIXES =
  "bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|decoration|caret|accent|divide|placeholder|ide";
const UTIL_RE = new RegExp(`(^|:)(${PREFIXES})-[a-zA-Z0-9/.\\-]+$`);

function isColorToken(tok) {
  if (/^#[0-9a-fA-F]{3,8}$/.test(tok)) return true;
  if (/^(rgba?|hsla?)\([^)]*\)[,;]?$/.test(tok)) return true;
  if (/^var\(--[a-zA-Z0-9-]+\)[,;]?$/.test(tok)) return true;
  if (UTIL_RE.test(tok.replace(/[,;]$/, ""))) return true;
  return false;
}

function isAllColorTokens(content) {
  const tokens = content.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every(isColorToken);
}

function stripComments(src) {
  // Remove /* ... */ and // ... comments. Not a full parser, but good enough
  // for a sanity diff (doesn't try to dodge // or /* inside string literals,
  // which is rare in this codebase's component files).
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function maskBalancedBraceExpr(str, startIdx) {
  let depth = 0;
  let i = startIdx;
  for (; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return i;
}

const COLOR = "\u0000COLOR\u0000";

// Regex literals containing a bare quote character (e.g. /"/g used to
// escape quotes for CSV export) desync the naive string scanner below,
// which can't tell a regex literal from a string. Neutralize the handful of
// forms actually used in this codebase before scanning.
function maskQuoteRegexLiterals(src) {
  return src.replace(/\/(\\?["'`])\/([a-z]*)/g, (_m, _q, flags) => `/\u0000RE\u0000/${flags}`);
}

export function normalize(src) {
  if (src == null) return null;
  src = stripComments(src);
  src = maskQuoteRegexLiterals(src);
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const m1 = /className\s*=\s*"/y;
    m1.lastIndex = i;
    const mm1 = m1.exec(src);
    if (mm1) {
      const start = mm1.index + mm1[0].length;
      const end = src.indexOf('"', start);
      out += `className="${COLOR}"`;
      i = end + 1;
      continue;
    }
    const m2 = /className\s*=\s*\{/y;
    m2.lastIndex = i;
    const mm2 = m2.exec(src);
    if (mm2) {
      const braceStart = mm2.index + mm2[0].length - 1;
      const end = maskBalancedBraceExpr(src, braceStart);
      out += `className={${COLOR}}`;
      i = end;
      continue;
    }
    // Any other single/double-quoted string literal made up entirely of
    // color/utility tokens (e.g. `color: "text-blue-500"`,
    // `"border-l-yellow-500"` in a lookup table).
    const m3 = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/y;
    m3.lastIndex = i;
    const mm3 = m3.exec(src);
    if (mm3) {
      const quote = mm3[0][0];
      const content = mm3[0].slice(1, -1);
      if (isAllColorTokens(content)) {
        out += `${quote}${COLOR}${quote}`;
      } else {
        out += mm3[0];
      }
      i = m3.lastIndex;
      continue;
    }
    out += src[i];
    i++;
  }

  // Color literals anywhere else (template literals, style strings, svg
  // markup, arbitrary Tailwind brackets like bg-[#fff] / text-[rgb(...)]).
  out = out
    .replace(/#[0-9a-fA-F]{3,8}\b/g, COLOR)
    .replace(/\b(rgba?|hsla?)\([^)]*\)/g, COLOR)
    .replace(/var\(--[a-zA-Z0-9-]+\)/g, COLOR)
    .replace(new RegExp(`\\[(${COLOR}|(${PREFIXES})-[a-zA-Z0-9/.\\-]+)\\]`, "g"), `[${COLOR}]`);

  // Collapse whitespace-only differences left behind by comment stripping.
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();

  return out;
}

let anyMismatch = false;
const mismatches = [];
for (const file of files) {
  const before = normalize(showAt(BASE, file));
  const after = normalize(showAt(HEAD, file));
  if (before === null || after === null) {
    console.log(`SKIP (added/removed) ${file}`);
    continue;
  }
  if (before === after) {
    console.log(`OK    ${file}`);
  } else {
    anyMismatch = true;
    mismatches.push(file);
    console.log(`DIFF  ${file}`);
  }
}
if (mismatches.length) {
  console.log("\n--- files with non-color diffs remaining ---");
  for (const f of mismatches) console.log(f);
}
process.exit(anyMismatch ? 1 : 0);
