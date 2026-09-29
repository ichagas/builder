import * as React from "react";
import type { LongTask, LongTaskStatus } from "@/components/shell/types";

/**
 * useLongTask (T029). See contracts/design-system.md §3: "useLongTask()
 * exposes start({id, label, channel}) and progress from realtime."
 *
 * This is the local store `StatusPill`/`StatusCenter` render from. T035
 * (WP-F5, "long-task bridge") wires existing runs (agent sessions, audits,
 * deploys) into it via `useProjectAgent`/`useAuditPipeline`/
 * `useRealtimeDeployments` without any page changes — those hooks call
 * `start`/the returned handle's `update`/`done`/`fail` from their own
 * realtime subscriptions. This file only owns the store; it does not
 * subscribe to any realtime channel itself.
 *
 * Finished tasks (done/failed) stay in the list for
 * `FINISHED_RETENTION_MS` so `StatusCenter`'s "Running and recent" list has
 * something to show right after a task completes, then are pruned.
 *
 * Running tasks are not persisted (a reload clears the store) but a task
 * whose owner never reports back (dropped realtime connection, unmounted
 * screen) would spin forever, so a running task with no `update`/`start`
 * for `STALE_RUNNING_MS` is marked failed and then pruned like any other
 * finished task.
 */
export interface StartLongTaskInput {
  id: string;
  label: string;
  channel?: string;
  href?: string;
}

export interface LongTaskHandle {
  update: (progress?: number, label?: string) => void;
  done: () => void;
  fail: () => void;
}

const FINISHED_RETENTION_MS = 5 * 60 * 1000;
/** A running task with no update for this long is considered stale. */
export const STALE_RUNNING_MS = 30 * 60 * 1000;

const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearStale(id: string) {
  const timer = staleTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    staleTimers.delete(id);
  }
}

/** (Re)arms the stale timer for a running task; fails and prunes it on expiry. */
function armStale(id: string) {
  clearStale(id);
  staleTimers.set(
    id,
    setTimeout(() => {
      staleTimers.delete(id);
      const t = tasks.get(id);
      if (!t || t.status !== "running") return;
      setTask(id, { status: "failed" });
      scheduleRemoval(id);
    }, STALE_RUNNING_MS),
  );
}

function scheduleRemoval(id: string) {
  setTimeout(() => {
    const t = tasks.get(id);
    if (t && t.status !== "running") {
      tasks.delete(id);
      notify();
    }
  }, FINISHED_RETENTION_MS);
}

const tasks = new Map<string, LongTask>();
const listeners = new Set<() => void>();
let snapshot: LongTask[] = [];

function recompute() {
  snapshot = Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
}

function notify() {
  recompute();
  listeners.forEach((listener) => listener());
}

function setTask(id: string, patch: Partial<LongTask> & { status: LongTaskStatus }) {
  const existing = tasks.get(id);
  tasks.set(id, {
    id,
    label: existing?.label ?? "",
    startedAt: existing?.startedAt ?? Date.now(),
    ...existing,
    ...patch,
  });
  notify();
}

export function startLongTask(input: StartLongTaskInput): LongTaskHandle {
  // Dedupe by id: if this run is already tracked and running (e.g. two
  // components/hook instances both bridge the same underlying run — T035),
  // reuse the existing entry instead of resetting its startedAt/status, so
  // the status pill shows one row per run, not one per caller.
  const existing = tasks.get(input.id);
  if (existing && existing.status === "running") {
    tasks.set(input.id, {
      ...existing,
      label: input.label,
      channel: input.channel ?? existing.channel,
      href: input.href ?? existing.href,
    });
  } else {
    tasks.set(input.id, {
      id: input.id,
      label: input.label,
      channel: input.channel,
      href: input.href,
      status: "running",
      startedAt: Date.now(),
    });
  }
  armStale(input.id);
  notify();

  const finish = (status: "done" | "failed") => {
    clearStale(input.id);
    setTask(input.id, { status });
    scheduleRemoval(input.id);
  };

  return {
    update: (progress, label) => {
      setTask(input.id, { status: "running", progress, ...(label ? { label } : {}) });
      armStale(input.id);
    },
    done: () => finish("done"),
    fail: () => finish("failed"),
  };
}

/**
 * Settles a task that is still running (no-op for unknown or already
 * settled ids), so an independent tracker and the screen that started the
 * task can both report the outcome without restarting it.
 */
export function settleLongTask(id: string, status: "done" | "failed"): void {
  const existing = tasks.get(id);
  if (!existing || existing.status !== "running") return;
  clearStale(id);
  setTask(id, { status });
  scheduleRemoval(id);
}

/** Removes a task from the list without recording an outcome. */
export function cancelLongTask(id: string): void {
  clearStale(id);
  if (tasks.delete(id)) notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

/** All tracked tasks (running + recently finished), newest first. */
export function useLongTasks(): LongTask[] {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test-only: clears all tracked tasks. Not used by production code. */
export function __resetLongTasksForTests(): void {
  staleTimers.forEach((timer) => clearTimeout(timer));
  staleTimers.clear();
  tasks.clear();
  notify();
}

export function useLongTask() {
  const tasksList = useLongTasks();
  return {
    tasks: tasksList,
    runningCount: tasksList.filter((t) => t.status === "running").length,
    failedCount: tasksList.filter((t) => t.status === "failed").length,
    start: startLongTask,
  };
}

export default useLongTask;
