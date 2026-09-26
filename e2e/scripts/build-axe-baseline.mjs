#!/usr/bin/env node
// WP-F6 (T016): aggregates the per-test NDJSON axe records (appended by
// recordAxeBaseline() in e2e/fixtures.ts) into e2e/baselines/axe-legacy.json
// -- one row per (pageId, viewport), each the max serious/critical count seen
// across retries. Run automatically at the end of `npm run test:legacy`.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const baselinesDir = path.resolve(dir, "..", "baselines");
const rawPath = path.join(baselinesDir, "axe-legacy.raw.jsonl");
const outPath = path.join(baselinesDir, "axe-legacy.json");

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
      note: "Baseline violation counts for app/frontend (legacy). Not a pass/fail gate -- WP-F6 records these so page-task agents can later assert app/frontend-new introduces no NEW serious/critical violations per page.",
      pages: rows,
    },
    null,
    2
  ) + "\n"
);
rmSync(rawPath);
console.log(`[build-axe-baseline] wrote ${rows.length} page/viewport rows to ${outPath}`);
