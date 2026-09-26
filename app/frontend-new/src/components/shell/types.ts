/**
 * Shared shell types (T024). See contracts/design-system.md §2 "Shell
 * components" for the contract each of these backs.
 */

/** A primary/secondary action rendered by `PageHeader`, mirrored on mobile
 * by `PrimaryActionSlot`, and driven through `ActionButton`. */
export interface ActionSpec {
  label: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  /** Why the action is disabled (shown as a tooltip/title). */
  disabledReason?: string;
  /** Confirmation copy — enables ActionButton's two-step confirm. */
  confirm?: string;
  /** Registers an undo entry with `useUndo` after the action succeeds. */
  undo?: { text: string; onUndo: () => void };
  tone?: "primary" | "danger" | "ghost";
}

export type PhaseNodeState = "base" | "todo" | "active" | "done" | "skipped";

export interface RailPhase {
  id: string;
  label: string;
  state: PhaseNodeState;
  note?: string;
  href: string;
}

export interface RailSection {
  id: string;
  label: string;
  href?: string;
  count?: number;
  /** Worst status dot for an assurance application row. */
  statusDot?: "ok" | "warn" | "bad";
}

export type ModeKind = "building" | "released" | "connected" | "standards";

export interface ModeBadgeInfo {
  kind: ModeKind;
  label: string;
}

export type TimelineNodeKind = "hist" | "current" | "building" | "hotfix" | "planned" | "more" | "day";

export interface TimelineNode {
  id: string;
  label: string;
  sub?: string;
  kind: TimelineNodeKind;
  verdict?: "green" | "yellow" | "red" | "blue";
}

/** A flag rendered inline in `TimelineStrip`, e.g. "First release". */
export interface TimelineFlag {
  /** Renders the flag immediately after this node's id. */
  afterId: string;
  label: string;
  pending?: boolean;
}

export type LongTaskStatus = "running" | "done" | "failed";

export interface LongTask {
  id: string;
  label: string;
  channel?: string;
  status: LongTaskStatus;
  /** 0-100, undefined for indeterminate. */
  progress?: number;
  href?: string;
  startedAt: number;
}
