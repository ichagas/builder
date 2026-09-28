import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useStandardsPrimaryAction } from "@/pages/standards.primaryAction";
import { useTechStacksPrimaryAction } from "@/pages/techStacks.primaryAction";
import { useBuildBooksPrimaryAction } from "@/pages/buildBooks.primaryAction";
import { useBuildBookDetailPrimaryAction } from "@/pages/buildBookDetail.primaryAction";
import { useBuildBookEditorPrimaryAction } from "@/pages/buildBookEditor.primaryAction";
import { useNoPrimaryAction, type SimpleRoute } from "./types";

const Gallery = lazyWithRetry(() => import("@/pages/Gallery"));
const Standards = lazyWithRetry(() => import("@/pages/Standards"));
const TechStacks = lazyWithRetry(() => import("@/pages/TechStacks"));
const BuildBooks = lazyWithRetry(() => import("@/pages/BuildBooks"));
const BuildBookDetail = lazyWithRetry(() => import("@/pages/BuildBookDetail"));
const BuildBookEditor = lazyWithRetry(() => import("@/pages/BuildBookEditor"));

/** Library routes (T033). See contracts/routes.md §1, "Layout: Library". */
export const LIBRARY_ROUTES: SimpleRoute[] = [
  // Title matches legacy's <h1> exactly ("Standards Library") — PR-16's
  // regression assertion (`getByRole("heading", { name: "Standards
  // Library" })`) runs unchanged against this app per contracts/routes.md
  // §2, so the restyled page's PageHeader-rendered heading must match it.
  { path: "standards", title: "Standards Library", usePrimaryAction: useStandardsPrimaryAction, Component: Standards },
  { path: "tech-stacks", title: "Tech stacks", usePrimaryAction: useTechStacksPrimaryAction, Component: TechStacks },
  { path: "build-books", title: "Build books", usePrimaryAction: useBuildBooksPrimaryAction, Component: BuildBooks },
  { path: "build-books/new", title: "New build book", usePrimaryAction: useBuildBookEditorPrimaryAction, Component: BuildBookEditor },
  { path: "build-books/:id", title: "Build book", usePrimaryAction: useBuildBookDetailPrimaryAction, Component: BuildBookDetail },
  { path: "build-books/:id/edit", title: "Edit build book", usePrimaryAction: useBuildBookEditorPrimaryAction, Component: BuildBookEditor },
  { path: "gallery", title: "Gallery", usePrimaryAction: useNoPrimaryAction, Component: Gallery },
];
