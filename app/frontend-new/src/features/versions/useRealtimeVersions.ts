import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { versionsKeys } from "./api";

/**
 * Subscribes to the `versions-{projectId}` realtime channel (data-model.md
 * "Realtime channels (new)": "version created, released, item moved") and
 * invalidates every versions/work-items query for this project so the
 * timeline (NV-01) and the All versions triage (NV-02) stay live without
 * polling -- same broadcast/subscribe/cleanup pattern as
 * `useRealtimeTeamPortfolio` (WP-A1).
 *
 * `work_item_created` isn't listed in data-model.md's channel table but is
 * broadcast on this channel by `POST /projects/:projectId/work-items`
 * (`workItems.ts`) -- included here so a newly reported change shows up in
 * the triage inbox live too.
 */
export function useRealtimeVersions(projectId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return undefined;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: versionsKeys.all(projectId) });
    };

    const channel = pronghornApi
      .channel(`versions-${projectId}`)
      .on("broadcast", { event: "version_created" }, invalidate)
      .on("broadcast", { event: "version_released" }, invalidate)
      .on("broadcast", { event: "item_moved" }, invalidate)
      .on("broadcast", { event: "work_item_created" }, invalidate)
      .subscribe();

    return () => {
      pronghornApi.removeChannel(channel);
    };
  }, [projectId, queryClient]);
}

export default useRealtimeVersions;
