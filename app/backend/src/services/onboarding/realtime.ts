/**
 * Realtime broadcasts for the onboarding wizard (spec 007, epic B3;
 * contracts/api.md: "Realtime: `onboarding-{runId}` streams
 * `{type:"log"|"step"|"done", ...}`"). Mirrors the shape of
 * `services/mesh/realtime.ts`: one small module owning the channel name and
 * event shape so `services/onboarding/index.ts` and a future dispatcher
 * (WP-BE6) can't drift into inconsistent payloads.
 */
import { broadcast } from "../../websocket";
import { JobProgressEvent } from "./jobDispatcher";

/** Canonical channel name for one onboarding run's realtime events. */
export function onboardingChannel(runId: string): string {
  return `onboarding-${runId}`;
}

/**
 * Forwards a `JobDispatcher`'s progress event onto the run's realtime
 * channel (fix round 1, item 12; wired in fix round 2, item 6). The event
 * itself already matches the documented `{type:"log"|"step"|"done", ...}`
 * shape, so it's broadcast as-is.
 */
export function broadcastOnboardingProgress(runId: string, event: JobProgressEvent): void {
  broadcast(onboardingChannel(runId), "onboarding_progress", event);
}
