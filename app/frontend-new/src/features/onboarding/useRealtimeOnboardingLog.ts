import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { onboardingKeys } from "./api";
import { jobProgressEventSchema, type JobProgressEvent } from "./job.api";

export interface OnboardingLogLine {
  id: number;
  kind: JobProgressEvent["type"];
  text: string;
  at?: string;
}

const MAX_LINES = 500;

/**
 * Subscribes to the `onboarding-{runId}` realtime channel (contracts/api.md;
 * services/onboarding/realtime.ts broadcasts `onboarding_progress` events
 * shaped `{type:"log"|"step"|"done", message?, step?, at?}`) and returns the
 * live log lines (T151, NO-03). A `done` event re-reads the run so the wizard
 * moves on to the output. `enabled` is false when the run isn't running:
 * no channel is opened, and a running run torn down (unmount, another run,
 * step change) removes its channel. Lines missed during a reconnect are not
 * replayed -- the run's own status (polled while running) and its final
 * `log_blob` are the source of truth.
 */
export function useRealtimeOnboardingLog(runId: string | undefined, enabled: boolean): OnboardingLogLine[] {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<OnboardingLogLine[]>([]);

  useEffect(() => {
    setLines([]);
    if (!runId || !enabled) return undefined;

    let nextId = 0;
    const channel = pronghornApi
      .channel(`onboarding-${runId}`)
      .on("broadcast", { event: "onboarding_progress" }, (message: { payload?: unknown }) => {
        const parsed = jobProgressEventSchema.safeParse(message?.payload);
        if (!parsed.success) return;
        const event = parsed.data;
        if (event.type === "done") {
          queryClient.invalidateQueries({ queryKey: onboardingKeys.run(runId) });
          return;
        }
        const text = event.message ?? event.step ?? "";
        if (!text) return;
        setLines((prev) => [...prev, { id: nextId++, kind: event.type, text, at: event.at }].slice(-MAX_LINES));
      })
      .subscribe();

    return () => {
      pronghornApi.removeChannel(channel);
    };
  }, [runId, enabled, queryClient]);

  return lines;
}

export default useRealtimeOnboardingLog;
