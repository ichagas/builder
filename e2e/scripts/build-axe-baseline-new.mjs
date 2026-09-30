#!/usr/bin/env node
// WP-F3 tester: aggregates the per-test NDJSON axe records (appended by
// recordAxeBaseline() in e2e/fixtures.ts, same raw file) into e2e/baselines/axe-new-f3.json, then diffs each
// (pageId, viewport) row's serious+critical count against the recorded
// frozen axe-legacy.json baseline (recorded once from the legacy app, now
// removed, T016/T017; never regenerated) so a reviewer can see at a glance
// whether the new shell introduces any NEW serious/critical violations.
//
// Usage (after `BASE_URL=... playwright test regression`, which
// populates baselines/axe-legacy.raw.jsonl -- see fixtures.ts):
//   node scripts/build-axe-baseline-new.mjs
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const baselinesDir = path.resolve(dir, "..", "baselines");
const rawPath = path.join(baselinesDir, "axe-legacy.raw.jsonl");
const outPath = path.join(baselinesDir, "axe-new-f3.json");
const legacyPath = path.join(baselinesDir, "axe-legacy.json");

if (!existsSync(rawPath)) {
  console.log(`[build-axe-baseline-new] no raw records at ${rawPath}, skipping`);
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

const legacyByKey = {};
if (existsSync(legacyPath)) {
  const legacy = JSON.parse(readFileSync(legacyPath, "utf8"));
  for (const row of legacy.pages) {
    legacyByKey[`${row.pageId}::${row.viewport}`] = row;
  }
}

const rows = Object.values(byKey)
  .sort((a, b) => a.pageId.localeCompare(b.pageId) || a.viewport.localeCompare(b.viewport))
  .map((row) => {
    const key = `${row.pageId}::${row.viewport}`;
    const legacyRow = legacyByKey[key];
    const legacyTotal = legacyRow ? legacyRow.serious + legacyRow.critical : 0;
    const newTotal = row.serious + row.critical;
    return {
      ...row,
      legacySeriousCritical: legacyRow ? legacyRow.serious + legacyRow.critical : null,
      delta: legacyRow ? newTotal - legacyTotal : newTotal,
    };
  });

const regressions = rows.filter((r) => r.delta > 0);

writeFileSync(
  outPath,
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      note:
        "Baseline violation counts for app/frontend-new (WP-F3 shell acceptance run). `delta` is this row's " +
        "serious+critical count minus the matching axe-legacy.json row (null legacyRow -> delta is the raw " +
        "new-app count, e.g. PR-22 shell-only rows with no legacy equivalent). The shell itself must add none.",
      regressionCount: regressions.length,
      pages: rows,
    },
    null,
    2
  ) + "\n"
);
rmSync(rawPath);
console.log(`[build-axe-baseline-new] wrote ${rows.length} page/viewport rows to ${outPath}`);
if (regressions.length > 0) {
  console.log(`[build-axe-baseline-new] ${regressions.length} row(s) show MORE serious+critical violations than legacy:`);
  for (const r of regressions) {
    console.log(`  - ${r.pageId} (${r.viewport}): legacy=${r.legacySeriousCritical ?? 0} new=${r.serious + r.critical}`);
  }
} else {
  console.log("[build-axe-baseline-new] no page/viewport shows more serious+critical violations than legacy.");
}
