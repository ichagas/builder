import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { runsKeys } from "../runs.api";

/**
 * Subscribes to the `team-{teamId}` channel (T124) and invalidates the
 * application's runs on `mesh_run_received` / `pr_state_changed`, so a new
 * run lands in the day list without polling (T132, NA-05). Unsubscribes on
 * unmount or when the team/application changes.
 */
export function useRealtimeRuns(teamId: string | undefined, appId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!teamId || !appId) return undefined;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: runsKeys.all(appId) });
    };
    const channel = pronghornApi
      .channel(`team-${teamId}`)
      .on("broadcast", { event: "mesh_run_received" }, invalidate)
      .on("broadcast", { event: "pr_state_changed" }, invalidate)
      .subscribe();
    return () => {
      pronghornApi.removeChannel(channel);
    };
  }, [teamId, appId, queryClient]);
}

export default useRealtimeRuns;
