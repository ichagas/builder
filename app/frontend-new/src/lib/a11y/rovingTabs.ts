import type * as React from "react";

/**
 * Arrow-key navigation for a `role="tablist"` (T160). Left/Right (wrapping),
 * Home and End move *focus* between the `[role="tab"]` descendants of the
 * container; activation stays manual (Enter/Space on the native button), so
 * moving through tabs never triggers navigation or data loads. Pair with
 * `tabIndex={isStop ? 0 : -1}` on the tabs so the list is one tab stop.
 */
export function handleTablistKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
  if (tabs.length === 0) return;
  const current = tabs.findIndex((el) => el === document.activeElement);
  let next: number;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else if (event.key === "ArrowRight") next = current < 0 ? 0 : (current + 1) % tabs.length;
  else next = current < 0 ? tabs.length - 1 : (current - 1 + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next]?.focus();
}
