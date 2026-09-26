/**
 * PR-14 Audit.
 * Capabilities exercised: page loads with no sessions; session selector
 * shows "No sessions yet"; the New Audit configuration dialog opens and
 * closes; reload.
 * Not exercised: orchestrator run, activity/pipeline streams, blackboard,
 * tesseract, knowledge graph, Venn, fit-gap, findings, coverage -- all
 * require an actual audit run through an LLM-backed pipeline. A previous
 * version of this spec drove that pipeline and was deleted as flaky (no
 * deterministic UI state to wait on for LLM-driven progress). This version
 * only exercises the deterministic, pre-run UI: no fixed sleeps, every
 * assertion waits on concrete UI state. See e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-14 audit: loads, session selector empty, new-audit dialog opens, reloads", async ({
  page,
}, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-14 Audit Project"));
  await page.goto(routes.project.audit(project.id));
  await expect(page.getByRole("heading", { name: "Audit", exact: true })).toBeVisible();
  await expect(page.getByText("No Audit Session Selected")).toBeVisible();

  // main read: session selector has no sessions for a fresh project
  await page.getByRole("combobox").filter({ hasText: /Select session/i }).click();
  await expect(page.getByText("No sessions yet")).toBeVisible();
  await page.keyboard.press("Escape");

  // main write entry point: New Audit configuration dialog opens
  await page.getByRole("button", { name: "Start New Audit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Audit", exact: true })).toBeVisible();
  await expect(page.getByText("No Audit Session Selected")).toBeVisible();

  await recordAxeBaseline(page, "pr-14", testInfo);
});
