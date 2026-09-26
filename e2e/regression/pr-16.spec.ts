/**
 * PR-16 Standards Library.
 * Capabilities exercised: categories list (seeded); create a category as
 * admin; reload restores it.
 * Not exercised: AI create standards (LLM), per-standard edit/attachments
 * and resources tree manager -- see e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-16 standards library: loads, lists seeded category, creates a category, reloads", async ({
  page,
}, testInfo) => {
  await page.goto(routes.standardsLibrary());
  await expect(page.getByRole("heading", { name: "Standards Library" })).toBeVisible();

  // main read: the seeded category is listed
  await expect(page.getByText("E2E Category")).toBeVisible();

  // main write: create a new category (owner is seeded as admin)
  const name = unique("PR-16 Category");
  await page.getByPlaceholder("New category name...").fill(name);
  await page.getByRole("button", { name: "Add Category" }).click();
  await expect(page.getByText("Category created")).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();

  // reload restores it
  await page.reload();
  await expect(page.getByText(name)).toBeVisible();

  await recordAxeBaseline(page, "pr-16", testInfo);
});
