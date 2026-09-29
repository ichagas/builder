import { useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import { settleLongTask, useLongTasks } from "@/lib/state/useLongTask";
import { fetchOnboardingRun, onboardingKeys, RUN_POLL_MS } from "./api";

export const ONBOARDING_TASK_PREFIX = "onboarding-";

/**
 * Keeps sandbox runs registered as long tasks honest after the wizard is
 * left (T151 follow-up). Mounted once in AssuranceLayout: for every running
 * `onboarding-{runId}` task it polls the run (same query key as the wizard,
 * so the cache is shared) until the run settles, then marks the task done
 * (ready) or failed (failed/cancelled). The job itself runs server-side, so
 * navigating away never stops it; this only stops the status pill lying.
 */
export function useOnboardingRunTracker(): void {
  const tasks = useLongTasks();
  const runIds = tasks
    .filter((task) => task.status === "running" && task.id.startsWith(ONBOARDING_TASK_PREFIX))
    .map((task) => task.id.slice(ONBOARDING_TASK_PREFIX.length));
  const key = runIds.join(",");

  const results = useQueries({
    queries: runIds.map((runId) => ({
      queryKey: onboardingKeys.run(runId),
      queryFn: () => fetchOnboardingRun(runId),
      refetchInterval: (query) =>
        query.state.data?.status === "running" || !query.state.data ? RUN_POLL_MS : false,
    })),
  });

  const statuses = results.map((r) => r.data?.status).join(",");
  useEffect(() => {
    results.forEach((result, i) => {
      const status = result.data?.status;
      if (status === "ready") settleLongTask(`${ONBOARDING_TASK_PREFIX}${runIds[i]}`, "done");
      else if (status === "failed" || status === "cancelled") settleLongTask(`${ONBOARDING_TASK_PREFIX}${runIds[i]}`, "failed");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, statuses]);
}
