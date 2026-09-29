import { lazyWithRetry } from "@/app/lazyWithRetry";
import { useNoPrimaryAction, type ProjectToolRoute, type SimpleRoute } from "./types";
import { useRequirementsPrimaryAction } from "@/pages/project/requirements.primaryAction";
import { usePresentPrimaryAction } from "@/pages/project/present.primaryAction";
import { useSpecificationsPrimaryAction } from "@/pages/project/specifications.primaryAction";
import { useProjectStandardsPrimaryAction } from "@/pages/project/standards.primaryAction";
import { useArtifactsPrimaryAction } from "@/pages/project/artifacts.primaryAction";
import { useChatPrimaryAction } from "@/pages/project/chat.primaryAction";
import { useCanvasPrimaryAction } from "@/pages/project/canvas.primaryAction";
import { useDeployPrimaryAction } from "@/pages/project/deploy.primaryAction";
import { useDatabasePrimaryAction } from "@/pages/project/database.primaryAction";
import { useBuildPrimaryAction } from "@/pages/project/build.primaryAction";
import { useAuditPrimaryAction } from "@/pages/project/audit.primaryAction";
import { useChangePrimaryAction } from "@/pages/project/change.primaryAction";

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
const ProjectSettings = lazyWithRetry(() => import("@/pages/project/ProjectSettings"));
const Versions = lazyWithRetry(() => import("@/pages/project/Versions"));
const Change = lazyWithRetry(() => import("@/pages/project/Change"));

/**
 * Project settings row (T041, WP-P3). See contracts/routes.md §1:
 * `/p/:id/settings`. Lives outside `PROJECT_TOOL_ROUTES` (it isn't a
 * phase/tool under `v/current/...`), so `app/router.tsx` mounts it as its
 * own child route of `ProjectLayout` with this as its `handle` -- the same
 * `{path, element, handle}` shape as every other registry row, just spread
 * individually instead of via `.map()`.
 */
export const PROJECT_SETTINGS_ROUTE: SimpleRoute = {
  path: "settings",
  title: "Project Settings",
  usePrimaryAction: useNoPrimaryAction,
  Component: ProjectSettings,
};

/**
 * All versions row (T110, WP-V1, NV-02). See contracts/routes.md §1:
 * "-- (new, US4) | `/p/:id/versions`, ... | Project | WP-V1...V4". Lives
 * outside `PROJECT_TOOL_ROUTES` for the same reason `PROJECT_SETTINGS_ROUTE`
 * does -- it isn't a phase/tool under `v/current/...` -- so `app/router.tsx`
 * mounts it as its own child route of `ProjectLayout`.
 */
export const PROJECT_VERSIONS_ROUTE: SimpleRoute = {
  path: "versions",
  title: "All versions",
  usePrimaryAction: useNoPrimaryAction,
  Component: Versions,
};

/**
 * Change page row (T111, WP-V2, NV-03/NV-04). contracts/routes.md §1:
 * `/p/:id/changes/:changeId/:step?` (step = define|design|build|ship). Like
 * All versions it sits outside `PROJECT_TOOL_ROUTES`; `app/router.tsx`
 * mounts it as its own child route of `ProjectLayout`.
 */
export const PROJECT_CHANGE_ROUTE: SimpleRoute = {
  path: "changes/:changeId/:step?",
  title: "Change",
  usePrimaryAction: useChangePrimaryAction,
  Component: Change,
};

/**
 * Project tool routes (T033). See contracts/routes.md §1:
 * `/p/:id/v/current/<phase>/<tool>`. Each row's `usePrimaryAction` is a
 * placeholder (`useNoPrimaryAction`) until its page is restyled (Phase 3
 * tasks T042-T053), at which point that page declares its own hook here.
 */
export const PROJECT_TOOL_ROUTES: ProjectToolRoute[] = [
  { tool: "requirements", phase: "define", title: "Requirements", usePrimaryAction: useRequirementsPrimaryAction, Component: Requirements },
  { tool: "standards", phase: "define", title: "Project Standards", usePrimaryAction: useProjectStandardsPrimaryAction, Component: ProjectStandards },
  { tool: "artifacts", phase: "define", title: "Artifacts", usePrimaryAction: useArtifactsPrimaryAction, Component: Artifacts },
  { tool: "chat", phase: "define", title: "Chat", usePrimaryAction: useChatPrimaryAction, Component: Chat },
  { tool: "canvas", phase: "design", title: "Canvas", usePrimaryAction: useCanvasPrimaryAction, Component: Canvas },
  { tool: "specifications", phase: "design", title: "Project Specifications", usePrimaryAction: useSpecificationsPrimaryAction, Component: Specifications },
  // T048 (WP-B1): title "Build", not "Build agent" -- PR-10's regression
  // spec asserts getByRole("heading", { name: "Build", exact: true })
  // unchanged, matching legacy's ProjectPageHeader heading text exactly
  // (same approach WP-S1 used for Deploy/"Environments").
  { tool: "agent", phase: "build", title: "Build", usePrimaryAction: useBuildPrimaryAction, Component: Build },
  { tool: "repository", phase: "build", title: "Repository", usePrimaryAction: useNoPrimaryAction, Component: Repository },
  { tool: "database", phase: "build", title: "Database", usePrimaryAction: useDatabasePrimaryAction, Component: Database },
  // T051 (WP-S1): title "Deploy", not "Environments", to match legacy's
  // ProjectPageHeader heading exactly -- PR-13's regression spec asserts
  // getByRole("heading", { name: "Deploy", exact: true }) unchanged (same
  // approach WP-L1 used for Standards: keep the row's title matching
  // legacy's heading text so the existing regression spec stays green).
  { tool: "environments", phase: "ship", title: "Deploy", usePrimaryAction: useDeployPrimaryAction, Component: Deploy },
  { tool: "audit", phase: "ship", title: "Audit", usePrimaryAction: useAuditPrimaryAction, Component: Audit },
  { tool: "present", phase: "ship", title: "Present", usePrimaryAction: usePresentPrimaryAction, Component: Present },
];

export const PHASE_ORDER: Array<{ id: "define" | "design" | "build" | "ship"; label: string }> = [
  { id: "define", label: "Define" },
  { id: "design", label: "Design" },
  { id: "build", label: "Build" },
  { id: "ship", label: "Ship" },
];
