import type { Version, WorkItem } from "../api";
import type { ReleaseCheck } from "../shared";

/**
 * Pure release-page logic (NV-05). Mirrors the backend's rules in
 * `services/versions/releaseService.ts` so the UI can explain them before
 * the user clicks; the backend stays the source of truth.
 */

const SEMVER_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i;

export function semverRank(name: string | null | undefined): [number, number, number] {
  const match = SEMVER_RE.exec(name ?? "");
  if (!match) return [0, 0, 0];
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

export function compareVersions(a: string, b: string): number {
  const ra = semverRank(a);
  const rb = semverRank(b);
  for (let i = 0; i < 3; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return 0;
}

/** `v1.4.2` -> `v1.5.0`: where unfinished changes carry over to. */
export function carryOverVersionName(name: string): string {
  const [major, minor] = semverRank(name);
  return `v${major}.${minor + 1}.0`;
}

/** True once the project has had its first release (the baseline is locked). */
export function hasFirstRelease(versions: Version[]): boolean {
  return versions.some((v) => v.kind === "released");
}

/**
 * Resolves the `:version` route param: a version name (canonical, used in
 * generated links) or a version id (`ProjectLayout.goToVersions` navigates
 * with ids). `current` (or no param) means "the version that goes out next":
 * the lowest open one.
 */
export function resolveReleaseTarget(versions: Version[], param: string | undefined): Version | undefined {
  const match = param ? versions.find((v) => v.name === param || v.id === param) : undefined;
  if (match) return match;
  if (param && param !== "current") return undefined;
  return [...versions].filter((v) => v.kind !== "released").sort((a, b) => compareVersions(a.name, b.name))[0];
}

/** The lowest still-open version ranked before `target`: it must go out first. */
export function findBlockingVersion(versions: Version[], target: Version): Version | undefined {
  return [...versions]
    .filter((v) => v.kind !== "released" && v.id !== target.id && compareVersions(v.name, target.name) < 0)
    .sort((a, b) => compareVersions(a.name, b.name))[0];
}

export function splitChanges(items: WorkItem[]): { shipped: WorkItem[]; carry: WorkItem[]; declined: WorkItem[] } {
  return {
    shipped: items.filter((i) => i.status === "shipped"),
    carry: items.filter((i) => i.status === "triage" || i.status === "active"),
    declined: items.filter((i) => i.status === "declined"),
  };
}

/** Draft release notes, same wording as the backend (`Fixed:` / `New:`). */
export function draftNotes(shipped: WorkItem[]): Array<{ id: string; prefix: "fixed" | "new"; title: string }> {
  return shipped.map((i) => ({ id: i.id, prefix: i.type === "bug" ? "fixed" : "new", title: i.title }));
}

/** Checks that don't gate the release (informational), per releaseService.releaseChecks. */
export function isInformationalCheck(check: ReleaseCheck, firstRelease: boolean): boolean {
  return check.id === "deployment-configured" || (check.id === "work-items-resolved" && !firstRelease);
}

/** Human message for a failed release call (409 order/merge conflict, 400 failing checks...). */
export function releaseErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const e = err as { message?: unknown; details?: unknown };
  const base = typeof e.message === "string" && e.message ? e.message : fallback;
  const checks = (e.details as { checks?: unknown } | undefined)?.checks;
  if (Array.isArray(checks)) {
    const labels = checks
      .map((c) => (c && typeof c === "object" ? (c as { detail?: string; label?: string }).detail ?? (c as { label?: string }).label : undefined))
      .filter((s): s is string => typeof s === "string");
    if (labels.length > 0) return `${base}: ${labels.join("; ")}`;
  }
  return base;
}
