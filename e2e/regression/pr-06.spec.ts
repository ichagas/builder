/**
 * PR-06 Artifacts.
 * Capabilities exercised: folder tree read (empty state); create folder;
 * reload.
 * Not exercised: universal upload/drop zone content, PDF/DOCX/PPTX/XLSX/
 * image viewers, move/rename/download, AI summarize, enhance image, visual
 * recognition import, collaboration editor/chat/timeline/heatmap -- most of
 * these need real files or an LLM; see e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, api, defaultOwner, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-06 artifacts: loads, creates a folder, reloads", async ({ page }, testInfo) => {
  const project = await api.createProject(defaultOwner, unique("PR-06 Artifacts Project"));
  await page.goto(routes.project.artifacts(project.id));
  await expect(page.getByRole("heading", { name: "Artifacts", exact: true })).toBeVisible();

  const folderName = unique("E2E Folder");
  await page.getByRole("button", { name: "Create Folder" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Folder Name").fill(folderName);
  await dialog.getByRole("button", { name: "Create Folder" }).click();
  await expect(dialog).toBeHidden();

  // The folder tree sidebar is desktop-only by design (`hidden md:block` in
  // Artifacts.tsx), so verify persistence through the API -- true at both
  // viewports -- rather than a UI element that's legitimately not rendered
  // on mobile.
  const folders = await api.get<Array<{ ai_title?: string; title?: string }>>(
    `/api/v1/artifacts/${project.id}`,
    defaultOwner
  );
  expect(folders.some((f) => f.ai_title === folderName || f.title === folderName)).toBe(true);

  await page.reload();
  const foldersAfterReload = await api.get<Array<{ ai_title?: string; title?: string }>>(
    `/api/v1/artifacts/${project.id}`,
    defaultOwner
  );
  expect(foldersAfterReload.some((f) => f.ai_title === folderName || f.title === folderName)).toBe(true);

  await recordAxeBaseline(page, "pr-06", testInfo);
});
