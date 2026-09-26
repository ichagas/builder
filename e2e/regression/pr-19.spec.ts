/**
 * PR-19 Gallery.
 * Capabilities exercised: browse (seeded published project); preview
 * dialog opens/closes; the clone entry point opens the clone dialog.
 *
 * Two legacy bugs found here:
 * 1. The backend's get_published_projects RPC aliases the project's
 *    name/description as `project_name`/`project_description`, but
 *    Gallery.tsx's PublishedProject type (and GalleryCard/
 *    GalleryPreviewDialog) read `.name`/`.description` -- so the gallery
 *    card and preview dialog title are always blank, never the published
 *    project's actual name. This spec asserts on what's actually visible
 *    (the projects count, the Preview/Clone buttons) rather than on the
 *    name text, which legacy never renders here.
 * 2. GalleryCloneDialog.tsx calls clone_published_project with
 *    `p_published_id`, but the backend route destructures
 *    `p_published_project_id` (routes/rpc.ts) -- so the id is always
 *    undefined server-side and every clone fails with "Published project
 *    not found". Cloning is completely broken in legacy.
 * 3. GalleryCloneDialog.tsx (and other admin/gallery dialogs) report
 *    success/failure through the shadcn `useToast` hook
 *    (@/hooks/use-toast), but main.tsx only mounts the sonner `<Toaster
 *    position="top-right" />` -- there is no `<Toaster />` from
 *    @/components/ui/toaster anywhere in the tree, so none of that hook's
 *    toasts are ever rendered. Combined with bug 2, cloning fails
 *    completely silently: no error, no navigation, the dialog just sits
 *    there. This spec waits on the clone_published_project response itself
 *    (not a toast) and asserts the dialog is still open and no navigation
 *    happened, which is the only observable, deterministic sign of the
 *    failure. See e2e/README.md coverage notes.
 */
import { test, expect, recordAxeBaseline, unique } from "../fixtures";
import { routes } from "../routes";

test("PR-19 gallery: loads, lists seeded project, previews, opens clone dialog", async ({
  page,
}, testInfo) => {
  await page.goto(routes.gallery());
  await expect(page.getByRole("heading", { name: "Project Gallery" })).toBeVisible();

  // main read: the seeded published project is counted and its card renders
  // (see bug 1 above for why its name isn't shown)
  await expect(page.getByText("1", { exact: true })).toBeVisible();
  await expect(page.getByText("Projects", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview" }).first()).toBeVisible();

  // preview dialog
  await page.getByRole("button", { name: "Preview" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // clone dialog opens and, per bugs 2/3 above, fails silently: wait for
  // the RPC response itself (no toast is ever rendered) and confirm the
  // dialog is still open with no navigation away from the gallery
  await page.getByRole("button", { name: "Clone" }).first().click();
  const cloneName = unique("PR-19 Clone");
  await page.getByLabel("New Project Name").fill(cloneName);
  const cloneResponse = page.waitForResponse((r) =>
    r.url().includes("/rpc/clone_published_project")
  );
  await page.getByRole("button", { name: "Clone Project" }).click();
  const response = await cloneResponse;
  const body = await response.json();
  expect(body.error).toBe("Published project not found");
  await expect(page.getByRole("dialog", { name: "Clone from Gallery" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${routes.gallery()}$`));

  await page.reload();
  await expect(page.getByRole("heading", { name: "Project Gallery" })).toBeVisible();

  await recordAxeBaseline(page, "pr-19", testInfo);
});
