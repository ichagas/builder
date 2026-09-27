import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { startLongTask, type LongTaskHandle } from "@/lib/state/useLongTask";

interface AgentOperation {
  id: string;
  session_id: string;
  operation_type: string;
  file_path: string | null;
  status: string;
  details: any;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// Operation statuses that mean the owning agent session is still working
// (T035, WP-F5 long-task bridge).
const ACTIVE_OPERATION_STATUSES = new Set(["pending", "in_progress"]);
const FAILED_OPERATION_STATUSES = new Set(["error", "failed"]);

export function useInfiniteAgentOperations(
  projectId: string | null, 
  shareToken: string | null,
  agentType: string = "coding"
) {
  const [operations, setOperations] = useState<AgentOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 10;

  const loadInitialOperations = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setOffset(0);
    
    try {
      const { data, error } = await pronghornApi.rpc("get_agent_operations_by_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_limit: LIMIT,
        p_offset: 0,
        p_agent_type: agentType,
      });

      if (error) throw error;
      
      setOperations(data || []);
      setHasMore((data || []).length === LIMIT);
      setOffset(LIMIT);
    } catch (error) {
      console.error("Error loading operations:", error);
      setOperations([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, shareToken, agentType]);

  // Load initial operations
  useEffect(() => {
    if (!projectId) {
      setOperations([]);
      setOffset(0);
      setHasMore(true);
      return;
    }

    loadInitialOperations();
  }, [projectId, shareToken, agentType, loadInitialOperations]);

  // Real-time subscription for agent-type-specific broadcast channel
  useEffect(() => {
    if (!projectId) return;

    console.log(`[AgentOperations] Setting up broadcast subscription for project ${projectId}, type ${agentType}`);

    const channel = pronghornApi
      .channel(`agent-operations-project-${projectId}-${agentType}`)
      .on("broadcast", { event: "agent_operation_refresh" }, (payload) => {
        console.log(`[AgentOperations] Received refresh broadcast for ${agentType}:`, payload);
        loadInitialOperations();
      })
      .subscribe((status) => {
        console.log(`[AgentOperations] Broadcast subscription status: ${status}`);
      });

    return () => {
      console.log(`[AgentOperations] Cleaning up broadcast subscription for project ${projectId}, type ${agentType}`);
      pronghornApi.removeChannel(channel);
    };
  }, [projectId, agentType, loadInitialOperations]);

  const loadMore = useCallback(async () => {
    if (!projectId || loading || !hasMore) return;

    setLoading(true);
    
    try {
      const { data, error } = await pronghornApi.rpc("get_agent_operations_by_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_limit: LIMIT,
        p_offset: offset,
        p_agent_type: agentType,
      });

      if (error) throw error;
      
      const newOperations = data || [];
      setOperations((prev) => [...prev, ...newOperations]);
      setHasMore(newOperations.length === LIMIT);
      setOffset((prev) => prev + LIMIT);
    } catch (error) {
      console.error("Error loading more operations:", error);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, shareToken, agentType, offset, loading, hasMore]);

  // T035 (WP-F5): bridge each agent session's operations into useLongTask,
  // so a running build/database agent session shows in the shell's status
  // pill/status center with no page edits (FR-005). One task per
  // (agentType, session), grouped from the currently loaded page of
  // operations — a session not currently active in that page is left
  // alone rather than force-finished, since it may simply be paginated out.
  const { t } = useTranslation();
  const sessionHandlesRef = useRef<Map<string, LongTaskHandle>>(new Map());

  useEffect(() => {
    const bySession = new Map<string, AgentOperation[]>();
    for (const operation of operations) {
      const list = bySession.get(operation.session_id) ?? [];
      list.push(operation);
      bySession.set(operation.session_id, list);
    }

    for (const [sessionId, ops] of bySession) {
      const id = `agent-${agentType}-${sessionId}`;
      const active = ops.some((op) => ACTIVE_OPERATION_STATUSES.has(op.status));
      if (active) {
        const label = t("shell.longTask.agent.running");
        const existing = sessionHandlesRef.current.get(id);
        if (existing) {
          existing.update(undefined, label);
        } else {
          sessionHandlesRef.current.set(
            id,
            startLongTask({
              id,
              label,
              href: projectId
                ? `/p/${projectId}/v/current/build/${agentType === "database" ? "database" : "agent"}`
                : undefined,
            }),
          );
        }
      } else {
        const existing = sessionHandlesRef.current.get(id);
        if (existing) {
          if (ops.some((op) => FAILED_OPERATION_STATUSES.has(op.status))) existing.fail();
          else existing.done();
          sessionHandlesRef.current.delete(id);
        }
      }
    }
  }, [operations, agentType, projectId, t]);

  useEffect(() => {
    const handles = sessionHandlesRef.current;
    return () => {
      // Unmount: drop our local handles only — a still-running session is
      // never marked done/failed just because this component went away.
      handles.clear();
    };
  }, []);

  return { operations, loading, hasMore, loadMore, refetch: loadInitialOperations };
}
