/**
 * PR-18 Build Books.
 * Capabilities exercised: list (seeded); the "New Build Book" entry point
 * opens the editor; editing (updating) the seeded book's details and
 * saving; detail page with docs viewer; reload.
 *
 * Legacy bug found: pronghornApiAdapter's QueryBuilder.select() always sets
 * queryType = "select" (src/lib/pronghornApiAdapter.ts), so chaining
 * `.insert(data).select("id").single()` -- as BuildBookEditor.tsx's create
 * path does -- silently turns the insert into a no-filter single-row
 * SELECT: nothing is written, and the id returned (and navigated to) is
 * just some existing row, while the UI still shows a "Build book created"
 * success toast. The same chain shape would break any other page's create
 * flow that follows this insert().select().single() pattern. This spec
 * only opens the create form (doesn't submit it, since the result is
 * undefined/non-deterministic once more than one build book exists) and
 * exercises the edit path instead, which uses plain `.update().eq()` and is
 * unaffected. See e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-18 build books: loads, lists seeded book, new-book form opens, edits and saves, reloads", async ({
  page,
}, testInfo) => {
  await page.goto(routes.buildBooks());
  await expect(page.getByRole("heading", { name: "Build Books" })).toBeVisible();

  // main read: the seeded build book is listed
  await expect(page.getByText("E2E Build Book")).toBeVisible();

  // New Build Book entry point opens the editor (not submitted -- see the
  // insert().select().single() bug noted above)
  await page.getByRole("button", { name: "New Build Book" }).click();
  await expect(page).toHaveURL(new RegExp(`${routes.buildBookNew()}$`));
  await expect(page.getByRole("heading", { name: "Create Build Book" })).toBeVisible();
  await expect(page.getByLabel("Name *")).toBeVisible();

  // open the seeded book's detail page and its edit entry point
  await page.goto(routes.buildBooks());
  await page.getByText("E2E Build Book").click();
  await expect(
    page.getByRole("heading", { name: "E2E Build Book", exact: true }).first()
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit Build Book" })).toBeVisible();
  await expect(page.getByLabel("Name *")).toHaveValue("E2E Build Book");

  // main write: update the short description and save (plain .update(), unaffected by the bug above)
  const shortDesc = unique("PR-18 updated description");
  await page.getByLabel("Short Description").fill(shortDesc);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Build book updated")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "E2E Build Book", exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText(shortDesc).first()).toBeVisible();

  // reload restores the update
  await page.reload();
  await expect(page.getByText(shortDesc).first()).toBeVisible();

  await recordAxeBaseline(page, "pr-18", testInfo);
});
