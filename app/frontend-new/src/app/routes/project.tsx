import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useNoPrimaryAction, type ProjectToolRoute } from "./types";

// Same lazy-loaded page components as the pre-router App.tsx (unchanged —
// this task moves routing, not pages; see plan.md "not in the recipe").
const Requirements = lazyWithRetry(() => import("@/pages/project/Requirements"));
const ProjectStandards = lazyWithRetry(() => import("@/pages/project/Standards"));
const Artifacts = lazyWithRetry(() => import("@/pages/project/Artifacts"));
const Chat = lazyWithRetry(() => import("@/pages/project/Chat"));
const Canvas = lazyWithRetry(() => import("@/pages/project/Canvas"));
const Specifications = lazyWithRetry(() => import("@/pages/project/Specifications"));
const Build = lazyWithRetry(() => import("@/pages/project/Build"));
const Repository = lazyWithRetry(() => import("@/pages/project/Repository"));
const Database = lazyWithRetry(() => import("@/pages/project/Database"));
const Deploy = lazyWithRetry(() => import("@/pages/project/Deploy"));
const Audit = lazyWithRetry(() => import("@/pages/project/Audit"));
const Present = lazyWithRetry(() => import("@/pages/project/Present"));

/**
 * Project tool routes (T033). See contracts/routes.md §1:
 * `/p/:id/v/current/<phase>/<tool>`. Each row's `usePrimaryAction` is a
 * placeholder (`useNoPrimaryAction`) until its page is restyled (Phase 3
 * tasks T042-T053), at which point that page declares its own hook here.
 */
export const PROJECT_TOOL_ROUTES: ProjectToolRoute[] = [
  { tool: "requirements", phase: "define", title: "Requirements", usePrimaryAction: useNoPrimaryAction, Component: Requirements },
  { tool: "standards", phase: "define", title: "Standards", usePrimaryAction: useNoPrimaryAction, Component: ProjectStandards },
  { tool: "artifacts", phase: "define", title: "Artifacts", usePrimaryAction: useNoPrimaryAction, Component: Artifacts },
  { tool: "chat", phase: "define", title: "Chat", usePrimaryAction: useNoPrimaryAction, Component: Chat },
  { tool: "canvas", phase: "design", title: "Canvas", usePrimaryAction: useNoPrimaryAction, Component: Canvas },
  { tool: "specifications", phase: "design", title: "Specifications", usePrimaryAction: useNoPrimaryAction, Component: Specifications },
  { tool: "agent", phase: "build", title: "Build agent", usePrimaryAction: useNoPrimaryAction, Component: Build },
  { tool: "repository", phase: "build", title: "Repository", usePrimaryAction: useNoPrimaryAction, Component: Repository },
  { tool: "database", phase: "build", title: "Database", usePrimaryAction: useNoPrimaryAction, Component: Database },
  { tool: "environments", phase: "ship", title: "Environments", usePrimaryAction: useNoPrimaryAction, Component: Deploy },
  { tool: "audit", phase: "ship", title: "Audit", usePrimaryAction: useNoPrimaryAction, Component: Audit },
  { tool: "present", phase: "ship", title: "Present", usePrimaryAction: useNoPrimaryAction, Component: Present },
];

export const PHASE_ORDER: Array<{ id: "define" | "design" | "build" | "ship"; label: string }> = [
  { id: "define", label: "Define" },
  { id: "design", label: "Design" },
  { id: "build", label: "Build" },
  { id: "ship", label: "Ship" },
];
