import * as React from "react";
import { startLongTask, type LongTaskHandle } from "./useLongTask";

/**
 * useLongTaskBridge (T035, WP-F5 "long-task bridge"). A small helper the
 * existing data hooks (`useAuditPipeline`, `useRealtimeDeployments`, the
 * agent-session hooks…) call to register their own runs with `useLongTask`
 * — see contracts/design-system.md §3 and `useLongTask.ts`'s doc comment.
 *
 * This is *not* a page-facing hook: pages don't call it, and don't change.
 * The data hooks call it internally, from their own state, so a run they
 * already track (agent session, audit pipeline, deployment) also shows up
 * in the shell's `StatusPill`/`StatusCenter` with no page edits (FR-005).
 *
 * Contract:
 * - `id: undefined` or `active: false` with no prior run means "nothing to
 *   bridge right now" — a no-op. This is what makes the bridge safe to call
 *   from a hook rendered outside the shell (no `AppShell`/provider mounted,
 *   as in the legacy app and in unit tests that render a hook alone):
 *   `startLongTask`/the returned handle only ever touch the module-level
 *   store in `useLongTask.ts`, which has no provider to be missing, so
 *   there is nothing to guard against throwing — the effect just has
 *   nothing to do until a real `id` and `active: true` arrive.
 * - Transitioning `active: false → true` starts (or, by id, adopts — see
 *   `startLongTask`'s dedupe) the task.
 * - While `active` stays `true` with the same `id`, subsequent calls only
 *   update label/progress — they never re-start (no startedAt reset).
 * - Transitioning `active: true → false` finishes the task: `done()` unless
 *   `failed` is true, then `fail()`.
 * - On unmount, only the *local* handle/id refs are dropped — the task
 *   itself is left exactly as it is in the store. A still-running run is
 *   never marked done/failed just because the component that started
 *   tracking it went away (its data may still be updating server-side).
 */
export interface LongTaskBridgeInput {
  /** Stable id for this run (e.g. `audit-${sessionId}`, `deploy-${id}`). */
  id: string | undefined;
  /** Whether the run is currently in progress. */
  active: boolean;
  label: string;
  progress?: number;
  href?: string;
  channel?: string;
  /** Whether the run that just ended (`active` went false) failed. */
  failed?: boolean;
}

export function useLongTaskBridge(input: LongTaskBridgeInput): void {
  const handleRef = React.useRef<LongTaskHandle | null>(null);
  const idRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (input.active && input.id) {
      if (handleRef.current && idRef.current === input.id) {
        handleRef.current.update(input.progress, input.label);
      } else {
        idRef.current = input.id;
        handleRef.current = startLongTask({
          id: input.id,
          label: input.label,
          href: input.href,
          channel: input.channel,
        });
      }
    } else if (handleRef.current) {
      if (input.failed) handleRef.current.fail();
      else handleRef.current.done();
      handleRef.current = null;
      idRef.current = undefined;
    }
  }, [input.active, input.id, input.progress, input.label, input.href, input.channel, input.failed]);

  React.useEffect(() => {
    return () => {
      // Unmount: drop our own reference only. Do not call done()/fail() —
      // the underlying run may still be in progress server-side, and
      // another mounted consumer of the same hook (or a future remount)
      // should keep seeing it as running until it truly finishes.
      handleRef.current = null;
      idRef.current = undefined;
    };
  }, []);
}

export default useLongTaskBridge;
