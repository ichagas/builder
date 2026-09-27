#!/usr/bin/env node
// WP-F6 (T016): aggregates the per-test NDJSON axe records (appended by
// recordAxeBaseline() in e2e/fixtures.ts) into e2e/baselines/axe-legacy.json
// -- one row per (pageId, viewport), each the max serious/critical count seen
// across retries. Run automatically at the end of `npm run test:legacy`.
//
// T020 (WP-F2c): accepts an optional `--out <filename>` so a manual "new"
// app axe run (e.g. `node scripts/build-axe-baseline.mjs --out
// axe-new-f2c.json`) writes its own baselines/<filename> instead of always
// clobbering axe-legacy.json -- previously the only way to keep a "new" run
// was to copy axe-legacy.json elsewhere and `git checkout` it back
// afterward. The raw NDJSON input (axe-legacy.raw.jsonl) is unaffected: it's
// just the fixed name `recordAxeBaseline()` in fixtures.ts appends to
// per-test, regardless of which app is under test.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const baselinesDir = path.resolve(dir, "..", "baselines");
const rawPath = path.join(baselinesDir, "axe-legacy.raw.jsonl");

const outFlagIndex = process.argv.indexOf("--out");
const outFileName = outFlagIndex !== -1 ? process.argv[outFlagIndex + 1] : "axe-legacy.json";
if (outFlagIndex !== -1 && !outFileName) {
  console.error("[build-axe-baseline] --out requires a filename");
  process.exit(1);
}
const outPath = path.join(baselinesDir, outFileName);

if (!existsSync(rawPath)) {
  console.log(`[build-axe-baseline] no raw records at ${rawPath}, skipping`);
  process.exit(0);
}

const lines = readFileSync(rawPath, "utf8").split("\n").filter(Boolean);
/** @type {Record<string, any>} */
const byKey = {};
for (const line of lines) {
  const rec = JSON.parse(line);
  const key = `${rec.pageId}::${rec.viewport}`;
  const prev = byKey[key];
  if (!prev || rec.serious + rec.critical > prev.serious + prev.critical) {
    byKey[key] = rec;
  }
}

const rows = Object.values(byKey).sort((a, b) => a.pageId.localeCompare(b.pageId) || a.viewport.localeCompare(b.viewport));
writeFileSync(
  outPath,
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      note:
        outFileName === "axe-legacy.json"
          ? "Baseline violation counts for app/frontend (legacy). Not a pass/fail gate -- WP-F6 records these so page-task agents can later assert app/frontend-new introduces no NEW serious/critical violations per page."
          : `Baseline violation counts recorded via --out ${outFileName}. See other files in this directory for what app/run they cover.`,
      pages: rows,
    },
    null,
    2
  ) + "\n"
);
rmSync(rawPath);
console.log(`[build-axe-baseline] wrote ${rows.length} page/viewport rows to ${outPath}`);
