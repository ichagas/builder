import type { TimelineFlag, TimelineNode, TimelineNodeKind, ModeKind } from "@/components/shell/types";
import type { Version } from "./api";
import i18n from "@/i18n";

/**
 * Maps `GET /projects/:projectId/versions` rows onto `TimelineStrip`'s
 * props (NV-01, T110/WP-V1). Shared by `ProjectLayout` (the persistent
 * strip on every project route) and the "All versions" page, so both
 * render the same nodes/flags/current-version logic.
 *
 * Per the spec edge case "A project with no versions (before B1): the
 * timeline shows one 'Building' version" -- and per D-7, still true for any
 * project whose `versions` row hasn't been created yet -- an empty
 * `versions` array falls back to a single synthetic "Building" node.
 */
export interface TimelineData {
  nodes: TimelineNode[];
  flags: TimelineFlag[];
  /** The version a project route should be "scoped" to right now. */
  currentId: string;
  currentLabel: string;
  currentKind: VersionEra;
}

export type VersionEra = "building" | "released";

const FALLBACK_ID = "building";

/** `versions.kind` (data-model.md) -> `TimelineNode.kind` (design-system.md). */
function nodeKindFor(version: Version): TimelineNodeKind {
  if (version.kind === "released") return version.is_current ? "current" : "hist";
  // "next" is the open version work is currently scheduled into before its
  // own release -- same "in progress, next up" visual treatment as
  // "building" (before the first release there's no other open version).
  if (version.kind === "next") return "building";
  return version.kind;
}

function changeCountLabel(count: number): string {
  return i18n.t("shell.timeline.changeCount", { count });
}

function formatRelative(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return i18n.t("shell.timeline.today");
  if (days === 1) return i18n.t("shell.timeline.oneDayAgo");
  return i18n.t("shell.timeline.daysAgo", { count: days });
}

function subLabelFor(version: Version, kind: TimelineNodeKind): string | undefined {
  if (kind === "hist" || kind === "current") return formatRelative(version.released_at);
  return changeCountLabel(version.work_item_count);
}

export function buildTimeline(versions: Version[]): TimelineData {
  const FALLBACK_LABEL = i18n.t("shell.timeline.building");
  if (versions.length === 0) {
    return {
      nodes: [{ id: FALLBACK_ID, label: FALLBACK_LABEL, kind: "building" }],
      flags: [],
      currentId: FALLBACK_ID,
      currentLabel: FALLBACK_LABEL,
      currentKind: "building",
    };
  }

  const nodes: TimelineNode[] = versions.map((version) => {
    const kind = nodeKindFor(version);
    return { id: version.id, label: version.name, sub: subLabelFor(version, kind), kind };
  });

  const flags: TimelineFlag[] = [];
  const firstRelease = versions.find((version) => version.is_first_release);
  if (firstRelease) {
    flags.push({ afterId: firstRelease.id, label: i18n.t("shell.timeline.firstRelease"), pending: firstRelease.kind !== "released" });
  }

  const current = versions.find((version) => version.is_current);
  if (current) {
    return { nodes, flags, currentId: current.id, currentLabel: current.name, currentKind: "released" };
  }
  // Before the first release there's exactly one "building" version and
  // nothing is current yet -- scope to it (D-7).
  const building = versions.find((version) => version.kind === "building") ?? versions[versions.length - 1];
  return { nodes, flags, currentId: building.id, currentLabel: building.name, currentKind: "building" };
}

/** `ModeBadge`/`GlobalBar`'s 3px band -- "building" before the first release, "released" after. */
export function modeKindFor(era: VersionEra): ModeKind {
  return era === "released" ? "released" : "building";
}

/**
 * Default name for a hotfix version "started" from triage (NV-02, no
 * existing open hotfix). Bumps the patch of the current released version,
 * e.g. `versions.js` `nextHotfix()`: `v1.4.2` -> `v1.4.3`. Falls back to a
 * plain counter-less label when there's no released version yet (or its
 * name isn't semver) -- this only names a *new* version, so a collision
 * with an existing name just surfaces as the backend's 409.
 */
export function suggestHotfixName(currentReleasedName: string | undefined): string {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(currentReleasedName ?? "");
  if (!match) return "hotfix-1";
  const [, major, minor, patch] = match;
  return `v${major}.${minor}.${Number(patch) + 1}`;
}
