import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useNoPrimaryAction, type SimpleRoute } from "./types";

const Gallery = lazyWithRetry(() => import("@/pages/Gallery"));
const Standards = lazyWithRetry(() => import("@/pages/Standards"));
const TechStacks = lazyWithRetry(() => import("@/pages/TechStacks"));
const BuildBooks = lazyWithRetry(() => import("@/pages/BuildBooks"));
const BuildBookDetail = lazyWithRetry(() => import("@/pages/BuildBookDetail"));
const BuildBookEditor = lazyWithRetry(() => import("@/pages/BuildBookEditor"));

/** Library routes (T033). See contracts/routes.md §1, "Layout: Library". */
export const LIBRARY_ROUTES: SimpleRoute[] = [
  { path: "standards", title: "Standards library", usePrimaryAction: useNoPrimaryAction, Component: Standards },
  { path: "tech-stacks", title: "Tech stacks", usePrimaryAction: useNoPrimaryAction, Component: TechStacks },
  { path: "build-books", title: "Build books", usePrimaryAction: useNoPrimaryAction, Component: BuildBooks },
  { path: "build-books/new", title: "New build book", usePrimaryAction: useNoPrimaryAction, Component: BuildBookEditor },
  { path: "build-books/:id", title: "Build book", usePrimaryAction: useNoPrimaryAction, Component: BuildBookDetail },
  { path: "build-books/:id/edit", title: "Edit build book", usePrimaryAction: useNoPrimaryAction, Component: BuildBookEditor },
  { path: "gallery", title: "Gallery", usePrimaryAction: useNoPrimaryAction, Component: Gallery },
];
