import * as React from "react";

/**
 * useUndo (T029). See contracts/design-system.md §3: "useUndo() exposes
 * push({text, undo})." And §2 UndoBar: "A single slot, bottom left on
 * desktop and above the mobile action on phones. One message at a time,
 * 7s."
 *
 * Implemented as a module-level external store (there is exactly one
 * UndoBar per contract, so a singleton is the simplest correct shape) so
 * any component can call `push` — including outside React event handlers,
 * e.g. after an async ActionButton action resolves — without prop-drilling
 * a context.
 */
export interface UndoEntry {
  text: string;
  undo: () => void;
}

const UNDO_TIMEOUT_MS = 7000;

let current: UndoEntry | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
}

export function pushUndo(entry: UndoEntry): void {
  current = entry;
  notify();
  clearTimer();
  timer = setTimeout(() => {
    current = undefined;
    notify();
  }, UNDO_TIMEOUT_MS);
}

export function dismissUndo(): void {
  clearTimer();
  if (current) {
    current = undefined;
    notify();
  }
}

/** Runs the pending undo action, then dismisses the bar. Used by UndoBar's "Undo" button. */
export function triggerUndo(): void {
  const entry = current;
  dismissUndo();
  entry?.undo();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

export function useUndo() {
  const entry = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    current: entry,
    push: pushUndo,
    dismiss: dismissUndo,
    trigger: triggerUndo,
  };
}

export default useUndo;
