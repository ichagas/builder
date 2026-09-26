/**
 * PR-07 Chat.
 * Capabilities exercised: session list read (empty state); create a new
 * session; reload.
 * Not exercised: sending a message (streaming LLM response), attach context
 * (artifacts/canvas/requirements/repo files/schema), summarize, clone --
 * see e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-07 chat: loads, creates a session, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-07 Chat Project"));
  await page.goto(routes.project.chat(project.id));

  await page.getByRole("button", { name: "New Chat" }).first().click();
  await expect(page.getByText("Chat session created")).toBeVisible();
  await expect(page.getByPlaceholder(/type your message/i)).toBeVisible();

  // Reload deselects the session (no session is "active" on a fresh load).
  // The sessions list panel is collapsed by default on mobile (a toggle
  // button with no accessible name flips it -- see Chat.tsx isSidebarCollapsed
  // -- a legacy accessibility gap, not fixed here since app/frontend is
  // immutable), so open it there before re-selecting the session; this
  // proves the session itself, not just in-memory UI state, survived the
  // reload. Located by its chevron icon rather than the `ml-auto` Tailwind
  // utility class: a layout class is an implementation detail of legacy's
  // current markup and isn't guaranteed to survive the restyle, whereas the
  // expand/collapse chevron is the semantic reason this button exists.
  await page.reload();
  if (testInfo.project.name === "mobile") {
    await page
      .getByRole("button")
      .filter({ has: page.locator("svg.lucide-chevron-right, svg.lucide-chevron-left") })
      .first()
      .click();
  }
  await page.getByText("New Chat", { exact: true }).first().click();
  await expect(page.getByPlaceholder(/type your message/i)).toBeVisible();

  await recordAxeBaseline(page, "pr-07", testInfo);
});
