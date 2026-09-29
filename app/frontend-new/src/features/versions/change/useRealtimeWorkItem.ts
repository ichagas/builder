import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { versionsKeys } from "../api";

/**
 * Subscribes to `work-item-{id}` (data-model.md "Realtime channels (new)":
 * "phase changed, agent progress") and invalidates the project's versions
 * queries, which include this change, its deltas and its agent session
 * (see `changeKeys`). Cleans up on unmount and when the id changes.
 */
export function useRealtimeWorkItem(projectId: string | undefined, workItemId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId || !workItemId) return undefined;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: versionsKeys.all(projectId) });
    };

    const channel = pronghornApi
      .channel(`work-item-${workItemId}`)
      .on("broadcast", { event: "phase_changed" }, invalidate)
      .on("broadcast", { event: "work_item_updated" }, invalidate)
      .on("broadcast", { event: "requirement_change_added" }, invalidate)
      .on("broadcast", { event: "agent_progress" }, invalidate)
      .subscribe();

    return () => {
      pronghornApi.removeChannel(channel);
    };
  }, [projectId, workItemId, queryClient]);
}

export default useRealtimeWorkItem;
