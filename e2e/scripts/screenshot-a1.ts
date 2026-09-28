// Ad-hoc screenshot capture for T130 (WP-A1). Not part of the Playwright
// test suite -- run manually against a live e2e stack:
//   node e2e/scripts/screenshot-a1.mjs
import { chromium, type Browser } from "@playwright/test";
import { buildMsalCacheEntries } from "../lib/msalCache.js";
import { config } from "../lib/config.js";
import { seed } from "../lib/seedIds.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.BASE_URL || "http://localhost:8140";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../specs/007-frontend-new/screenshots/A1");

const owner = { id: seed.ownerUserId, email: seed.ownerEmail, name: seed.ownerName };

async function shot(browser: Browser, { name, viewport, path: route }: { name: string; viewport: { width: number; height: number }; path: string }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const entries = buildMsalCacheEntries(owner, config.msal);
  await page.addInitScript((seededEntries) => {
    for (const [key, value] of Object.entries(seededEntries)) {
      window.localStorage.setItem(key, value);
    }
  }, entries);
  await page.goto(`${BASE_URL}${route}`);
  await page.getByRole("heading", { name: /Permits Platform|Licensing/ }).waitFor();
  await page.waitForTimeout(300);
  // Viewport-only (not fullPage): AppShell's MobileTabBar/status bars are
  // `position: fixed`, which Chromium's full-page capture repeats at every
  // viewport-height band of the composited scroll image -- a screenshot
  // artifact, not a real rendering bug.
  await page.screenshot({ path: path.join(OUT_DIR, name) });
  await context.close();
}

const browser = await chromium.launch();
await shot(browser, { name: "portfolio-1440.png", viewport: { width: 1440, height: 900 }, path: `/assurance/t/${seed.assuranceTeamId}` });
await shot(browser, { name: "portfolio-390.png", viewport: { width: 390, height: 844 }, path: `/assurance/t/${seed.assuranceTeamId}` });
await browser.close();
console.log("Screenshots written to", OUT_DIR);
