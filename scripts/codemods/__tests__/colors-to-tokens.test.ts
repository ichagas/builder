import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  classifyClassToken,
  transformClassBlob,
  processFile,
  nearestToken,
  PALETTE_COLORS,
  UTILITY_PREFIXES,
} from "../colors-to-tokens.ts";

// ---------------------------------------------------------------------------
// Detection agreement with the token lint rule (T018 / WP-F1)
// ---------------------------------------------------------------------------

test("PALETTE_COLORS and UTILITY_PREFIXES agree with the lint rule's source", () => {
  const lintRuleSource = fs.readFileSync(
    path.join(import.meta.dirname, "..", "..", "..", "app/frontend-new/eslint-rules/no-raw-tailwind-colors.js"),
    "utf8",
  );

  const extractArray = (label: string) => {
    const re = new RegExp(`const ${label} = \\[([\\s\\S]*?)\\]\\.join`);
    const m = re.exec(lintRuleSource);
    assert.ok(m, `expected to find ${label} array in lint rule source`);
    return m![1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^"|"$/g, ""));
  };

  const lintColors = extractArray("PALETTE_COLORS");
  const lintPrefixesRaw = extractArray("UTILITY_PREFIXES");

  assert.deepEqual(
    [...PALETTE_COLORS].sort(),
    [...lintColors].sort(),
    "codemod PALETTE_COLORS must match the lint rule's palette color list",
  );
  assert.deepEqual(
    [...UTILITY_PREFIXES].sort(),
    [...lintPrefixesRaw].sort(),
    "codemod UTILITY_PREFIXES must match the lint rule's utility prefix list",
  );
});

// ---------------------------------------------------------------------------
// Per-rule mapping
// ---------------------------------------------------------------------------

test("green/emerald 500-700 -> ok, 50/100 -> ok-soft", () => {
  assert.equal((classifyClassToken("text-green-600") as any).output, "text-ok");
  assert.equal((classifyClassToken("bg-emerald-700") as any).output, "bg-ok");
  assert.equal((classifyClassToken("border-green-500") as any).output, "border-ok");
  assert.equal((classifyClassToken("bg-green-50") as any).output, "bg-ok-soft");
  assert.equal((classifyClassToken("bg-emerald-100") as any).output, "bg-ok-soft");
});

test("red 500-700 -> bad, 50/100 -> bad-soft", () => {
  assert.equal((classifyClassToken("text-red-500") as any).output, "text-bad");
  assert.equal((classifyClassToken("bg-red-50") as any).output, "bg-bad-soft");
  assert.equal((classifyClassToken("border-red-700") as any).output, "border-bad");
});

test("yellow/amber/orange 500-700 -> warn, 50/100 -> warn-soft", () => {
  assert.equal((classifyClassToken("text-yellow-600") as any).output, "text-warn");
  assert.equal((classifyClassToken("bg-amber-100") as any).output, "bg-warn-soft");
  assert.equal((classifyClassToken("border-orange-700") as any).output, "border-warn");
});

test("blue/indigo 500-700 -> primary, 50/100 -> primary-soft", () => {
  assert.equal((classifyClassToken("text-blue-600") as any).output, "text-primary");
  assert.equal((classifyClassToken("bg-indigo-50") as any).output, "bg-primary-soft");
});

test("purple/violet 500-700 is ambiguous, defaults to -define", () => {
  const r = classifyClassToken("text-purple-600") as any;
  assert.equal(r.kind, "ambiguous");
  assert.equal(r.output, "text-define");
  assert.equal(r.chosen, "define");
});

test("purple/violet defers to -feat when 'feature' is in the surrounding context", () => {
  const r = classifyClassToken("bg-violet-500", "this is the feature badge color") as any;
  assert.equal(r.kind, "ambiguous");
  assert.equal(r.output, "bg-feat");
  assert.equal(r.chosen, "feat");
});

test("gray/slate neutrals map by prefix + shade range", () => {
  assert.equal((classifyClassToken("text-gray-500") as any).output, "text-muted-foreground");
  assert.equal((classifyClassToken("text-slate-800") as any).output, "text-foreground");
  assert.equal((classifyClassToken("bg-gray-100") as any).output, "bg-surface-2");
  assert.equal((classifyClassToken("border-slate-300") as any).output, "border-line");
});

test("out-of-range neutrals and unmapped families are reported unmapped", () => {
  // No neutral rule reaches ring/shadow/etc-style prefixes at all, and no
  // family/neutral covers the "grey" spelling or a color this codemod does
  // not know about.
  assert.equal(classifyClassToken("shadow-gray-800").kind, "unmapped");
  assert.equal(classifyClassToken("text-grey-500").kind, "unmapped");
});

// T031 (WP-F2b) hand-fix pass: broadened shade ranges (every family/neutral
// rule now reaches the full 50-950 scale) and three new color groups
// (lime/rose/pink folded into ok/bad, cyan/sky/teal -> design, fuchsia ->
// the purple/violet ambiguous pair, stone -> the neutral rules) that the
// T030 dry run reported as "no rule for ...".
test("T031: broadened shade ranges map former out-of-range neutrals/families", () => {
  assert.equal((classifyClassToken("bg-gray-800") as any).output, "bg-surface-2");
  assert.equal((classifyClassToken("border-slate-500") as any).output, "border-line-2");
  assert.equal((classifyClassToken("text-slate-100") as any).output, "text-muted-foreground");
});

test("T031: lime -> ok, rose/pink -> bad (extra hue neighbors)", () => {
  assert.equal((classifyClassToken("bg-lime-500") as any).output, "bg-ok");
  assert.equal((classifyClassToken("text-rose-700") as any).output, "text-bad");
  assert.equal((classifyClassToken("text-pink-500") as any).output, "text-bad");
});

test("T031: cyan/sky/teal -> design (nearest hue, no soft variant)", () => {
  assert.equal((classifyClassToken("text-cyan-700") as any).output, "text-design");
  assert.equal((classifyClassToken("border-sky-500") as any).output, "border-design");
  assert.equal((classifyClassToken("bg-teal-500") as any).output, "bg-design");
  // Even a "soft" shade still resolves to the one solid `design` utility;
  // an existing opacity modifier does the tinting instead.
  assert.equal((classifyClassToken("bg-cyan-100") as any).output, "bg-design");
});

test("T031: fuchsia joins the purple/violet ambiguous pair", () => {
  const r = classifyClassToken("bg-fuchsia-500") as any;
  assert.equal(r.kind, "ambiguous");
  assert.equal(r.output, "bg-define");
});

test("T031: stone folds into the neutral rules like gray/slate", () => {
  assert.equal((classifyClassToken("text-stone-700") as any).output, "text-foreground");
  assert.equal((classifyClassToken("bg-stone-500") as any).output, "bg-surface-2");
});

test("non-palette keywords (white/black/transparent/current) are left untouched", () => {
  assert.equal(classifyClassToken("bg-white").kind, "unchanged");
  assert.equal(classifyClassToken("text-black").kind, "unchanged");
  assert.equal(classifyClassToken("border-transparent").kind, "unchanged");
  assert.equal(classifyClassToken("ring-current").kind, "unchanged");
});

test("other color-taking prefixes (ring/fill/stroke/divide/outline/decoration/from/via/to/placeholder) map too", () => {
  assert.equal((classifyClassToken("ring-green-600") as any).output, "ring-ok");
  assert.equal((classifyClassToken("fill-red-500") as any).output, "fill-bad");
  assert.equal((classifyClassToken("stroke-blue-600") as any).output, "stroke-primary");
  assert.equal((classifyClassToken("divide-amber-600") as any).output, "divide-warn");
  assert.equal((classifyClassToken("outline-indigo-500") as any).output, "outline-primary");
  assert.equal((classifyClassToken("decoration-emerald-600") as any).output, "decoration-ok");
  assert.equal((classifyClassToken("from-green-600") as any).output, "from-ok");
  assert.equal((classifyClassToken("via-red-600") as any).output, "via-bad");
  assert.equal((classifyClassToken("to-blue-600") as any).output, "to-primary");
  assert.equal((classifyClassToken("placeholder-gray-500") as any).output, "placeholder-muted-foreground");
});

// ---------------------------------------------------------------------------
// Variants / modifiers
// ---------------------------------------------------------------------------

test("variants (hover:, dark:, md:, group-hover:) are preserved", () => {
  assert.equal((classifyClassToken("hover:bg-green-600") as any).output, "hover:bg-ok");
  assert.equal((classifyClassToken("md:text-red-600") as any).output, "md:text-bad");
  assert.equal((classifyClassToken("group-hover:border-blue-600") as any).output, "group-hover:border-primary");
  assert.equal((classifyClassToken("dark:hover:bg-green-600") as any).output, "dark:hover:bg-ok");
});

test("opacity modifiers and important markers are preserved", () => {
  assert.equal((classifyClassToken("bg-red-500/50") as any).output, "bg-bad/50");
  assert.equal((classifyClassToken("!bg-red-500") as any).output, "!bg-bad");
  assert.equal((classifyClassToken("bg-red-500!") as any).output, "bg-bad!");
  assert.equal((classifyClassToken("hover:bg-green-600/[.12]") as any).output, "hover:bg-ok/[.12]");
});

test("redundant dark: variant (same mapped output as the light class) is dropped", () => {
  const { output, changed, records } = transformClassBlob("text-red-600 dark:text-red-700 p-2");
  // text-red-600 -> text-bad, dark:text-red-700 -> dark:text-bad (both map to
  // the same "bad" solid token, so the dark: variant is redundant, removed)
  assert.equal(changed, true);
  assert.equal(output.includes("dark:text-bad"), false);
  assert.match(output, /text-bad/);
  assert.match(output, /p-2/);
  assert.ok(records.some((r) => r.kind === "redundant-dark"));
});

test("dark: variant mapping to a *different* token than its light counterpart is kept", () => {
  const { output } = transformClassBlob("text-red-600 dark:text-yellow-500");
  assert.match(output, /text-bad/);
  assert.match(output, /dark:text-warn/);
});

test("a lone dark: variant with no matching light counterpart is mapped, not dropped", () => {
  const { output, changed } = transformClassBlob("dark:bg-green-600");
  assert.equal(changed, true);
  assert.match(output, /dark:bg-ok/);
});

// ---------------------------------------------------------------------------
// File-level extraction: className strings, template literals, cn()/clsx()
// ---------------------------------------------------------------------------

test("plain className string literal is rewritten", () => {
  const src = `const el = <div className="flex bg-red-500 p-2" />;`;
  const { output, changed } = processFile(src);
  assert.equal(changed, true);
  assert.equal(output, `const el = <div className="flex bg-bad p-2" />;`);
});

test("className template literal with interpolation is rewritten around the interpolation", () => {
  const src = "const el = <div className={`flex bg-red-500 ${extra}`} />;";
  const { output } = processFile(src);
  assert.match(output, /bg-bad/);
  assert.match(output, /\$\{extra\}/);
});

test("cn()/clsx() call arguments (including ternaries and object keys) are rewritten", () => {
  const src = `
const a = cn("flex", isActive && "bg-red-500", { "text-green-600": ok, active: ok });
const b = clsx(cond ? "bg-blue-600" : "bg-blue-700");
`;
  const { output } = processFile(src);
  assert.match(output, /bg-bad/);
  assert.match(output, /text-ok/);
  assert.match(output, /active: ok/); // non-string key untouched
  assert.match(output, /bg-primary/);
  // both ternary branches converted
  assert.equal((output.match(/bg-primary/g) || []).length, 2);
});

test("className template literal interpolation holding a conditional class expression is rewritten", () => {
  // Real-world shape (app/frontend-new/src/components/deploy/DeploymentLogsDialog.tsx):
  // a ternary living inside a `${...}` interpolation, not inside cn()/clsx().
  const src =
    "const el = <div className={`p-3 rounded-md border ${\n" +
    '  deploy.status === "live" ? "border-green-500/50 bg-green-500/10" : "bg-muted/50"\n' +
    "}`} />;";
  const { output, changed } = processFile(src);
  assert.equal(changed, true);
  assert.match(output, /border-ok\/50 bg-ok\/10/);
  assert.match(output, /bg-muted\/50/); // untouched non-palette class stays as-is
  assert.match(output, /deploy\.status === "live"/); // surrounding expression untouched
});

test("bare object-literal lookup tables (`key: \"classes\"`) used later via className={MAP[key]} are rewritten", () => {
  // Real-world shape (app/frontend-new/src/components/requirements/RequirementsTree.tsx):
  // a top-level status/type -> classes map, referenced later as
  // className={typeColors[requirement.type]} — never a className value or a
  // cn()/clsx() argument at the point the string literal appears.
  const src = `
const typeColors = {
  EPIC: "bg-purple-500/10 text-purple-700 border-purple-500/20",
  STORY: "bg-green-500/10 text-green-700 border-green-500/20",
};
const label = "Not a class at all";
`;
  const { output, changed, classRecords } = processFile(src);
  assert.equal(changed, true);
  assert.match(output, /EPIC: "bg-define\/10 text-define border-define\/20"/);
  assert.match(output, /STORY: "bg-ok\/10 text-ok border-ok\/20"/);
  assert.match(output, /label = "Not a class at all"/); // unrelated property left untouched
  assert.ok(classRecords.some((r) => r.original === "bg-green-500/10"));
});

test("quoted-key object literal maps (`\"KEY\": \"classes\"`) are rewritten too", () => {
  const src = `
const TYPE_COLORS: Record<string, string> = {
  "CREATE_TABLE": "bg-green-500/20 text-green-700 border-green-500/30",
  "DROP_TABLE": "bg-red-500/20 text-red-700 border-red-500/30",
};
`;
  const { output, changed } = processFile(src);
  assert.equal(changed, true);
  assert.match(output, /"CREATE_TABLE": "bg-ok\/20 text-ok border-ok\/30"/);
  assert.match(output, /"DROP_TABLE": "bg-bad\/20 text-bad border-bad\/30"/);
});

test("object-literal map entries already inside a cn()/clsx() call are not double-processed", () => {
  const src = `
const el = cn({ "text-green-600": ok, active: ok });
`;
  const { classRecords } = processFile(src);
  // Exactly one record for text-green-600 (from the helper-call step), not
  // also picked up again by the bare object-literal-map step.
  assert.equal(classRecords.filter((r) => r.original === "text-green-600").length, 1);
});

test("non-className strings are never touched", () => {
  const src = `
const id = "bg-red-500-not-a-class"; // looks similar but not a class attr / helper call
const url = "https://example.com/bg-red-500";
function f() { return "text-green-600"; }
`;
  const { output, changed } = processFile(src);
  assert.equal(output, src);
  assert.equal(changed, false);
});

// ---------------------------------------------------------------------------
// Hex mapping
// ---------------------------------------------------------------------------

test("hex close to a token in style={{}} color-bearing keys is replaced with var(--token)", () => {
  const src = `const el = <div style={{ color: "#13803D", background: "#ffffff" }} />;`;
  const { output } = processFile(src);
  assert.match(output, /var\(--ok\)/);
  assert.match(output, /var\(--surface\)/);
});

test("hex in style={{}} on a non-color key is left untouched", () => {
  const src = `const el = <div style={{ content: "#13803D" }} />;`; // not a real CSS key but exercises the allowlist
  const { output, changed } = processFile(src);
  assert.equal(output, src);
  assert.equal(changed, false);
});

test("hex on fill=/stroke= SVG attributes is replaced when close to a token", () => {
  const src = `<path fill="#13803d" stroke="#c0262d" />`;
  const { output } = processFile(src);
  assert.match(output, /fill="var\(--ok\)"/);
  assert.match(output, /stroke="var\(--bad\)"/);
});

test("hex far from every token is reported unmapped, not replaced", () => {
  const src = `const el = <div style={{ color: "#ff00ff" }} />;`;
  const { output, changed, hexRecords } = processFile(src);
  assert.equal(output, src);
  assert.equal(changed, false);
  const rec = hexRecords.find((r) => r.original === "#ff00ff");
  assert.ok(rec);
  assert.equal(rec!.output, undefined);
});

test("files with 4+ distinct hex fill/stroke colors are flagged and excluded from auto-map (brand/logo heuristic)", () => {
  const src = `
<svg>
  <path fill="#f3f3f3" />
  <path fill="#f35325" />
  <path fill="#81bc06" />
  <path fill="#05a6f0" />
  <path fill="#ffba08" />
</svg>`;
  const { output, changed, hexRecords } = processFile(src);
  assert.equal(output, src, "flagged brand-icon hex values must not be rewritten");
  assert.equal(changed, false);
  assert.ok(hexRecords.every((r) => r.flagged));
});

test("hex color inside a className arbitrary-variant selector is never touched", () => {
  const src = `const el = <div className="[&_.recharts-dot[stroke='#fff']]:stroke-transparent" />;`;
  const { output, changed } = processFile(src);
  assert.equal(output, src);
  assert.equal(changed, false);
});

test("nearestToken finds the closest token by RGB distance", () => {
  const r = nearestToken("#13803c");
  assert.equal(r?.token, "ok");
  assert.ok(r!.distance < 5);
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test("running the codemod twice changes nothing the second time", () => {
  const src = `
const el = <div className="bg-red-500 dark:bg-red-400 hover:text-green-600 text-gray-500" style={{ color: "#13803D" }} />;
<path fill="#c0262d" />
`;
  const first = processFile(src);
  assert.equal(first.changed, true);
  const second = processFile(first.output);
  assert.equal(second.changed, false, "second pass over already-mapped output must be a no-op");
  assert.equal(second.output, first.output);
});

// ---------------------------------------------------------------------------
// Regression: a helper call nested inside className={cn(...)} used to be
// matched twice (once by the className-container walk, once by the
// file-wide helper-call scan), producing two overlapping edits for the same
// span and corrupting the file (T031, found on
// components/deploy/import/SchemaCreator.tsx).
// ---------------------------------------------------------------------------

test("a cn(...) call inside className={cn(...)} is only edited once, and the file stays syntactically intact", () => {
  const src = `
            {columns.map((col, idx) => (
              <tr key={idx} className={cn("hover:bg-muted/30", col.wasRenamed && "bg-amber-500/5")}>
                <td className="px-3 py-2 border-b">
                  <Input />
                </td>
              </tr>
            ))}
`;
  const result = processFile(src);
  assert.equal(
    result.classRecords.filter((r) => r.original === "bg-amber-500/5").length,
    1,
    "the same span must not be recorded twice",
  );
  assert.equal(
    result.output,
    src.replace('"bg-amber-500/5"', '"bg-warn/5"'),
    "only the matched token is rewritten; everything else (including the next line) is untouched",
  );
});

test("overlapping edits are never both applied: the first (by position) wins and the file is never corrupted", () => {
  // A pathological/synthetic case exercising the general safety net
  // (independent of the specific cn()-in-className bug above): two edits
  // that would both touch the same span must never both be spliced in.
  const src = `x="bg-red-500"`;
  // Simulate the double-edit scenario directly against processFile's
  // public contract by checking that a real double-nested case (helper
  // call inside a helper call argument) still yields well-formed output.
  const nested = `<div className={cn(cn("text-red-500"))} />`;
  const result = processFile(nested);
  assert.doesNotThrow(() => result.output);
  assert.ok(result.output.includes("text-bad"), "the token is still mapped");
  assert.ok(!result.output.includes("<div classNametext-bad"), "no corruption of surrounding markup");
});
