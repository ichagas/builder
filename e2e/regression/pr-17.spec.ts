/**
 * PR-17 Tech Stacks.
 * Capabilities exercised: tech stacks list (seeded); create a tech stack as
 * admin; reload restores it.
 * Not exercised: per-item tree manager (child items) and resources -- see
 * e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-17 tech stacks: loads, lists seeded stack, creates a tech stack, reloads", async ({
  page,
}, testInfo) => {
  await page.goto(routes.techStacks());
  await expect(page.getByRole("heading", { name: "Tech Stacks" })).toBeVisible();

  // main read: the seeded tech stack is listed
  await expect(page.getByText("E2E Tech Stack")).toBeVisible();

  // main write: create a new tech stack (owner is seeded as admin)
  const name = unique("PR-17 Stack");
  await page.getByPlaceholder("New tech stack name...").fill(name);
  await page.getByRole("button", { name: "Add Tech Stack" }).click();
  await expect(page.getByText("Tech stack created")).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();

  // reload restores it
  await page.reload();
  await expect(page.getByText(name)).toBeVisible();

  await recordAxeBaseline(page, "pr-17", testInfo);
});
