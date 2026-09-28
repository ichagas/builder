import { defineConfig, devices } from "@playwright/test";

/**
 * WP-F6 regression harness (spec 007, T016).
 *
 * BASE_URL / APP switch: the same spec files run against either app by
 * pointing at a different dev server and telling e2e/routes.ts which URL
 * shape to use.
 *   APP=legacy BASE_URL=http://localhost:8140  -> app/frontend
 *   APP=new    BASE_URL=http://localhost:8140  -> app/frontend-new
 *
 * See e2e/README.md for how to bring up the stack and serve an app.
 */
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.FE_PORT || 8140}`;

export default defineConfig({
  testDir: ".",
  testMatch: ["regression/**/*.spec.ts", "shell/**/*.spec.ts", "new/**/*.spec.ts"],
  outputDir: "test-results",
  fullyParallel: false, // pages share seeded projects; keep ordering predictable per file
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
});
