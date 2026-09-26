/**
 * PR-05 Project standards.
 * Capabilities exercised: link a standard to the project (tree selector,
 * checkbox); save; reload restores the selection.
 * Not exercised: tech stack item selection (the seeded tech stack has no
 * child items so its row is a disabled category-only checkbox), Apply Build
 * Book -- see e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique, seed } from "../fixtures";
import { routes } from "../routes";

test("PR-05 project standards: loads, links a standard, saves, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-05 Standards Project"));
  await page.goto(routes.project.standards(project.id));
  await expect(page.getByRole("heading", { name: "Project Standards" })).toBeVisible();

  // main read: the seeded category is listed (its one standard is collapsed
  // by default -- selecting via the category checkbox below also proves the
  // standard under it exists and links, without needing to expand the tree)
  await expect(page.getByText("E2E Category")).toBeVisible();

  // main write: select the whole category (id is fixed by seed.sql) and save
  const categoryCheckbox = page.locator(`#category-${seed.standardCategoryId}`);
  await categoryCheckbox.click();
  await expect(categoryCheckbox).toHaveAttribute("data-state", "checked");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Project standards saved successfully")).toBeVisible();

  // reload restores the selection
  await page.reload();
  await expect(page.locator(`#category-${seed.standardCategoryId}`)).toHaveAttribute("data-state", "checked");

  await recordAxeBaseline(page, "pr-05", testInfo);
});
