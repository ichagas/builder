import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { assuranceKeys } from "./api";

/**
 * Subscribes to the `team-{teamId}` realtime channel (WP-BE4, T124;
 * data-model.md "Realtime channels") and invalidates the application query
 * on any of its events (`mesh_run_received`, `pr_state_changed`,
 * `app_added`) so the application page (mesh verdicts, PR state, adoption)
 * stays live without polling (T131, WP-A2, NA-03/NA-04) — same
 * broadcast/subscribe pattern as `useRealtimeTeamPortfolio`. The channel is
 * per-team (not per-application), so every event on it invalidates this
 * application's query too; that's a coarser cache key than the underlying
 * event needs, but avoids a second, application-scoped channel for what's
 * already a single cheap GET.
 */
export function useRealtimeApplication(teamId: string | undefined, appId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!teamId || !appId) return undefined;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: assuranceKeys.application(appId) });
    };

    const channel = pronghornApi
      .channel(`team-${teamId}`)
      .on("broadcast", { event: "mesh_run_received" }, invalidate)
      .on("broadcast", { event: "pr_state_changed" }, invalidate)
      .on("broadcast", { event: "app_added" }, invalidate)
      .subscribe();

    return () => {
      pronghornApi.removeChannel(channel);
    };
  }, [teamId, appId, queryClient]);
}

export default useRealtimeApplication;
