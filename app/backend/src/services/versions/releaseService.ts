/**
 * Release service interface (WP-BE2 owns the implementation).
 *
 * `versions.ts` mounts the release/first-release/release-checks routes and
 * delegates the actual business logic (in-order release rule, carry-over of
 * unfinished work items, git tagging, deploy through existing settings,
 * first-release checks, locking the baseline, flipping `projects.stage`) to
 * whatever is bound to {@link releaseService}. Until WP-BE2 lands its
 * implementation, {@link notImplementedReleaseService} answers every call
 * with 501 so the routes are wired and testable end-to-end.
 */
import { createError } from "../../middleware/errorHandler";

export interface ReleaseCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ReleaseChecksResult {
  projectId: string;
  checks: ReleaseCheck[];
  canRelease: boolean;
}

export interface ReleaseResult {
  version: Record<string, unknown>;
  carriedOverWorkItemIds: string[];
}

export interface FirstReleaseResult {
  version: Record<string, unknown>;
  project: Record<string, unknown>;
}

export interface ReleaseService {
  /**
   * Release `versionId` for `projectId`. Enforces the in-order (semver
   * ascending) release rule, carries unfinished work items to the next
   * open version, tags the release, and deploys through existing settings.
   */
  release(projectId: string, versionId: string, actorId?: string): Promise<ReleaseResult>;

  /**
   * First release for `projectId`: runs the first-release checks, tags
   * `v1.0.0`, locks the baseline, and sets `projects.stage = 'released'`.
   */
  firstRelease(projectId: string, actorId?: string): Promise<FirstReleaseResult>;

  /** Checks for the first or next release, without performing it. */
  releaseChecks(projectId: string): Promise<ReleaseChecksResult>;
}

const NOT_IMPLEMENTED_MESSAGE =
  "Release business logic is owned by WP-BE2 and has not been implemented yet.";

/**
 * Placeholder implementation: every method rejects with a 501 so routes
 * mounted against it are fully wired (auth, validation, response shape)
 * while WP-BE2 builds the real release/first-release/release-checks logic.
 */
export class NotImplementedReleaseService implements ReleaseService {
  async release(): Promise<ReleaseResult> {
    throw createError(501, NOT_IMPLEMENTED_MESSAGE, "NOT_IMPLEMENTED");
  }

  async firstRelease(): Promise<FirstReleaseResult> {
    throw createError(501, NOT_IMPLEMENTED_MESSAGE, "NOT_IMPLEMENTED");
  }

  async releaseChecks(): Promise<ReleaseChecksResult> {
    throw createError(501, NOT_IMPLEMENTED_MESSAGE, "NOT_IMPLEMENTED");
  }
}

/**
 * Module-level singleton the routes call through. WP-BE2 can replace this
 * (e.g. via {@link setReleaseService}, mainly for tests) once it lands a
 * real implementation, without either work package touching the other's
 * owned files.
 */
export let releaseService: ReleaseService = new NotImplementedReleaseService();

/** Test/DI hook: swap the singleton implementation. */
export function setReleaseService(service: ReleaseService): void {
  releaseService = service;
}
