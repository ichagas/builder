/**
 * Shared Playwright fixtures for the WP-F6 regression harness (T016).
 *
 * Every regression/shell spec should import `test`/`expect` from here
 * (not directly from @playwright/test) so mock auth is wired up
 * automatically and the axe helper is one import away.
 */
import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { buildMsalCacheEntries, type MockAuthUser } from "./lib/msalCache.js";
import { config } from "./lib/config.js";
import { seed } from "./lib/seedIds.js";
import { api, tokenFor, unique } from "./lib/api.js";

export const defaultOwner: MockAuthUser = {
  id: seed.ownerUserId,
  email: seed.ownerEmail,
  name: seed.ownerName,
};

type Fixtures = {
  /** The signed-in user for this test. Pass `null` via test.use() for anonymous/share-token specs. */
  mockUser: MockAuthUser | null;
};

export const test = base.extend<Fixtures>({
  mockUser: [defaultOwner, { option: true }],

  // Seed the MSAL cache before ANY page script runs, for every page opened
  // in this test's context (see fixtures/msalCache.ts for why this exists
  // instead of driving a real Microsoft login).
  page: async ({ page, mockUser }, use) => {
    if (mockUser) {
      const entries = buildMsalCacheEntries(mockUser, config.msal);
      await page.addInitScript((seededEntries) => {
        for (const [key, value] of Object.entries(seededEntries)) {
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // localStorage may be unavailable (rare); mock auth just won't apply.
          }
        }
      }, entries);
    }
    await use(page);
  },
});

export { expect };
export { seed, api, tokenFor, unique, config };
export type { MockAuthUser };

/** Runs axe-core against the current page state. */
export async function runAxe(page: Page) {
  return new AxeBuilder({ page }).analyze();
}

export interface AxeCounts {
  serious: number;
  critical: number;
}

export function countSeriousCritical(results: Awaited<ReturnType<typeof runAxe>>): AxeCounts {
  let serious = 0;
  let critical = 0;
  for (const violation of results.violations) {
    if (violation.impact === "serious") serious += violation.nodes.length;
    if (violation.impact === "critical") critical += violation.nodes.length;
  }
  return { serious, critical };
}

/**
 * Runs axe and appends one NDJSON line recording (pageId, viewport, serious,
 * critical) counts. This never fails the test (violations are only
 * *recorded*, per D-13/tasks.md; the "no NEW violations" comparison is done
 * by scripts/build-axe-baseline-new.mjs against the frozen
 * baselines/axe-legacy.json).
 *
 * Appended (not read-modify-write) so parallel workers never race on the
 * file; e2e/scripts/build-axe-baseline-new.mjs aggregates it into a
 * per-task axe-new-*.json baseline. (axe-legacy.json itself is frozen: it was
 * recorded once from the legacy app, which no longer exists.)
 */
export async function recordAxeBaseline(page: Page, pageId: string, testInfo: { project: { name: string } }) {
  const results = await runAxe(page);
  const counts = countSeriousCritical(results);
  const fs = await import("node:fs");
  const path = await import("node:path");
  const outDir = path.resolve(import.meta.dirname, "baselines");
  fs.mkdirSync(outDir, { recursive: true });
  const line = JSON.stringify({
    pageId,
    viewport: testInfo.project.name,
    serious: counts.serious,
    critical: counts.critical,
    violations: results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
  });
  fs.appendFileSync(path.join(outDir, "axe-legacy.raw.jsonl"), line + "\n");
  return counts;
}
