import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { assuranceKeys } from "./api";

/**
 * Subscribes to the `team-{teamId}` realtime channel (WP-BE4, T124) and
 * invalidates the team portfolio query on any of its events
 * (`mesh_run_received`, `pr_state_changed`, `app_added`) so the portfolio
 * (repos, "not reporting", PR state) stays live without polling — same
 * broadcast/subscribe pattern as `useRealtimeProject`.
 */
export function useRealtimeTeamPortfolio(teamId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!teamId) return undefined;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: assuranceKeys.portfolio(teamId) });
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
  }, [teamId, queryClient]);
}

export default useRealtimeTeamPortfolio;
