/**
 * PR-05 Project standards.
 * Capabilities exercised: link a standard to the project (tree selector,
 * checkbox); save; reload restores the selection.
 * Not exercised: tech stack item selection (the seeded tech stack has no
 * child items so its row is a disabled category-only checkbox), Apply Build
 * Book -- see e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-05 project standards: loads, links a standard, saves, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-05 Standards Project"));
  await page.goto(routes.project.standards(project.id));
  await expect(page.getByRole("heading", { name: "Project Standards" })).toBeVisible();

  // main read: the seeded category is listed (its one standard is collapsed
  // by default -- selecting via the category checkbox below also proves the
  // standard under it exists and links, without needing to expand the tree)
  await expect(page.getByText("E2E Category")).toBeVisible();

  // main write: select the whole category via its checkbox's accessible
  // name (the category's own label, not a DOM id -- the `category-<id>`
  // id/htmlFor pairing is legacy's own implementation detail and isn't
  // guaranteed to survive the restyle, whereas the checkbox-labelled-by-its-
  // category-name relationship is a plain accessibility requirement) and save
  const categoryCheckbox = page.getByRole("checkbox", { name: "E2E Category" });
  await categoryCheckbox.click();
  await expect(categoryCheckbox).toBeChecked();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Project standards saved successfully")).toBeVisible();

  // reload restores the selection
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "E2E Category" })).toBeChecked();

  await recordAxeBaseline(page, "pr-05", testInfo);
});
