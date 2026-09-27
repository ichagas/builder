import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import type { Database } from "@/integrations/pronghorn-api/types";
import { startLongTask, type LongTaskHandle } from "@/lib/state/useLongTask";

type Deployment = Database["public"]["Tables"]["project_deployments"]["Row"];

// deployment_status values that mean "in progress" (see
// contracts/design-system.md §3 useLongTask, T035 WP-F5): "running" is a
// steady, deployed-and-up state, not an in-flight one.
const ACTIVE_DEPLOYMENT_STATUSES = new Set(["pending", "building", "deploying"]);

export const useRealtimeDeployments = (
  projectId: string | undefined,
  shareToken: string | null,
  enabled: boolean = true
) => {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const channelRef = useRef<ReturnType<typeof pronghornApi.channel> | null>(null);
  const deploymentsRef = useRef<Deployment[]>([]);

  // Merge new deployments with existing ones to avoid UI disruption
  const mergeDeployments = useCallback((newData: Deployment[]) => {
    setDeployments(prev => {
      if (prev.length === 0) {
        deploymentsRef.current = newData;
        return newData;
      }
      
      // Create a map of new deployments by ID
      const newMap = new Map(newData.map(d => [d.id, d]));
      
      // Check if anything actually changed
      let hasChanges = prev.length !== newData.length;
      
      if (!hasChanges) {
        for (const existing of prev) {
          const updated = newMap.get(existing.id);
          if (!updated || 
              existing.status !== updated.status ||
              (existing as any).azure_container_app_name !== (updated as any).azure_container_app_name ||
              existing.url !== updated.url ||
              existing.last_deployed_at !== updated.last_deployed_at) {
            hasChanges = true;
            break;
          }
        }
      }
      
      if (!hasChanges) return prev; // Return same reference to avoid re-render
      
      // Merge: update existing items in place, add new ones, remove deleted ones
      const result = newData.map(newDep => {
        const existing = prev.find(p => p.id === newDep.id);
        // If fields are the same, preserve the existing object reference
        if (existing &&
            existing.status === newDep.status &&
            (existing as any).azure_container_app_name === (newDep as any).azure_container_app_name &&
            existing.url === newDep.url &&
            existing.last_deployed_at === newDep.last_deployed_at) {
          return existing;
        }
        return newDep;
      });
      
      deploymentsRef.current = result;
      return result;
    });
  }, []);

  const loadDeployments = useCallback(async () => {
    if (!projectId || !enabled) return;

    setIsLoading(true);
    try {
      const { data, error } = await pronghornApi.rpc("get_deployments_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (!error) {
        mergeDeployments((data as Deployment[]) || []);
      }
    } catch (error) {
      console.error("Error loading deployments:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, shareToken, enabled, mergeDeployments]);

  // Refresh status for cloud deployments, then reload from DB
  const refreshCloudStatus = useCallback(async () => {
    if (!projectId || !enabled) return;

    setIsRefreshing(true);
    try {
      // Use ref to get current deployments without adding to dependency array
      const cloudDeployments = deploymentsRef.current.filter(
        d => d.platform === "pronghorn_cloud" && (d as any).azure_container_app_name
      );

      // For each cloud deployment with a service, fetch real status
      await Promise.all(cloudDeployments.map(async (deployment) => {
        try {
          await pronghornApi.functions.invoke("cloud-deployment", {
            body: {
              action: "status",
              deploymentId: deployment.id,
              shareToken: shareToken,
            },
          });
        } catch (err) {
          console.error(`Failed to refresh status for ${deployment.id}:`, err);
        }
      }));

      // Reload from DB to get updated statuses (uses merge to avoid disruption)
      const { data, error } = await pronghornApi.rpc("get_deployments_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      
      if (!error && data) {
        mergeDeployments(data as Deployment[]);
      }
    } catch (error) {
      console.error("Error refreshing cloud status:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, shareToken, enabled, mergeDeployments]);

  // Broadcast refresh to other clients
  const broadcastRefresh = useCallback(() => {
    if (channelRef.current && typeof channelRef.current.send === "function") {
        channelRef.current.send({
        type: "broadcast",
        event: "deployment_refresh",
        payload: { projectId },
      });
    }
  }, [projectId]);

  useEffect(() => {
    loadDeployments();

    if (!projectId || !enabled) return;

    const channel = pronghornApi
      .channel(`deployments-${projectId}`)
      .on("broadcast", { event: "deployment_refresh" }, () => loadDeployments())
      .subscribe((status) => {
        console.log("Deployments channel status:", status);
      });

    channelRef.current = channel;

    return () => {
      pronghornApi.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, enabled, shareToken, loadDeployments]);

  // T035 (WP-F5): bridge each deployment's own status into useLongTask, so
  // an in-flight deploy shows in the shell's status pill/status center with
  // no page edits (FR-005). One task per deployment id — dedupe across
  // hook instances is handled by `startLongTask` itself (T035 note in
  // useLongTask.ts).
  const { t } = useTranslation();
  const deployHandlesRef = useRef<Map<string, LongTaskHandle>>(new Map());

  useEffect(() => {
    for (const deployment of deployments) {
      const id = `deploy-${deployment.id}`;
      if (ACTIVE_DEPLOYMENT_STATUSES.has(deployment.status)) {
        const label = t("shell.longTask.deploy.running", { name: deployment.name });
        const existing = deployHandlesRef.current.get(id);
        if (existing) {
          existing.update(undefined, label);
        } else {
          deployHandlesRef.current.set(
            id,
            startLongTask({
              id,
              label,
              href: projectId ? `/p/${projectId}/v/current/ship/environments` : undefined,
            }),
          );
        }
      } else {
        const existing = deployHandlesRef.current.get(id);
        if (existing) {
          if (deployment.status === "failed") existing.fail();
          else existing.done();
          deployHandlesRef.current.delete(id);
        }
      }
    }
  }, [deployments, projectId, t]);

  useEffect(() => {
    const handles = deployHandlesRef.current;
    return () => {
      // Unmount: drop our local handles only — don't mark any still-running
      // deployment as done/failed, its status is tracked server-side.
      handles.clear();
    };
  }, []);

  return {
    deployments,
    isLoading,
    isRefreshing,
    refresh: refreshCloudStatus,
    broadcastRefresh,
  };
};

