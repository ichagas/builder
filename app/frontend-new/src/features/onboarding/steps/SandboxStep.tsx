import * as React from "react";
import { useTranslation } from "react-i18next";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { ActionButton } from "@/components/shell/ActionButton";
import { EmptyState } from "@/components/shell/atoms";
import { useLongTask } from "@/lib/state/useLongTask";
import { usePublishOnboardingWizardPrimaryAction } from "@/pages/assurance/onboardingWizard.primaryAction";
import type { OnboardingRun } from "../api";
import { extractErrorMessage } from "../errors";
import { useStartOnboardingRun } from "../job.api";
import { useRealtimeOnboardingLog } from "../useRealtimeOnboardingLog";

/**
 * Step 3, "Run in sandbox" (T151, NO-03). Draft: start the sandbox job.
 * Running: live log from the `onboarding-{runId}` channel, registered with
 * `useLongTask` so it shows in the status pill while the wizard is open.
 * Ready: continue to the output review. Failed/cancelled: terminal states
 * with a way out. The run itself is polled while running (api.ts), so a
 * dropped realtime connection only costs live lines, never the outcome.
 */
export function SandboxStep({
  run,
  onContinue,
  onStartOver,
}: {
  run: OnboardingRun;
  onContinue: () => void;
  onStartOver: () => void;
}) {
  const { t } = useTranslation();
  const start = useStartOnboardingRun();
  const [startError, setStartError] = React.useState<string | null>(null);
  const running = run.status === "running";
  const lines = useRealtimeOnboardingLog(run.id, running);
  const longTask = useLongTask();
  const startLongTask = longTask.start;

  // Register the sandbox run as a long task while it runs and settle it when
  // the status leaves "running" (a run that was already finished when the
  // page opened never had a task, so nothing is settled for it). Leaving the
  // wizard mid-run just stops updating: the job keeps running server-side.
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    const input = {
      id: `onboarding-${run.id}`,
      label: t("onboarding.sandbox.longTask", { name: run.application_name }),
      channel: `onboarding-${run.id}`,
    };
    if (run.status === "running") {
      wasRunning.current = true;
      startLongTask(input);
    } else if (wasRunning.current && (run.status === "ready" || run.status === "failed")) {
      wasRunning.current = false;
      const handle = startLongTask(input);
      if (run.status === "ready") handle.done();
      else handle.fail();
    }
  }, [run.status, run.id, run.application_name, startLongTask, t]);

  const canStart = run.status === "draft" && run.repositories.some((r) => r.selected) && !start.isPending;
  const handleStart = React.useCallback(async () => {
    setStartError(null);
    try {
      await start.mutateAsync(run.id);
    } catch (error) {
      setStartError(extractErrorMessage(error, t("onboarding.sandbox.startError")));
    }
  }, [run.id, start, t]);

  usePublishOnboardingWizardPrimaryAction(
    run.status === "draft"
      ? {
          label: t("onboarding.sandbox.start"),
          onClick: handleStart,
          disabled: !canStart,
          disabledReason: canStart ? undefined : t("onboarding.sandbox.startDisabled"),
        }
      : run.status === "ready"
        ? { label: t("onboarding.sandbox.review"), onClick: onContinue }
        : undefined,
  );

  const blobLines = React.useMemo(() => (run.log_blob ? run.log_blob.split("\n").filter(Boolean) : []), [run.log_blob]);
  const logLines: string[] = lines.length > 0 ? lines.map((l) => l.text) : blobLines;

  return (
    <div className="flex flex-col gap-4">
      {run.status === "draft" ? (
        <NextStepBanner
          tone="info"
          title={t("onboarding.sandbox.draft.title")}
          body={t("onboarding.sandbox.draft.body", { count: run.repositories.length })}
        />
      ) : null}
      {run.status === "running" ? (
        <NextStepBanner tone="info" title={t("onboarding.sandbox.running.title")} body={t("onboarding.sandbox.running.body")} />
      ) : null}
      {run.status === "ready" ? (
        <NextStepBanner tone="ok" title={t("onboarding.sandbox.ready.title")} body={t("onboarding.sandbox.ready.body")} />
      ) : null}
      {run.status === "failed" ? (
        <div className="flex flex-col gap-2">
          <NextStepBanner tone="warn" title={t("onboarding.sandbox.failed.title")} body={t("onboarding.sandbox.failed.body")} />
          <div>
            <ActionButton label={t("onboarding.sandbox.startOver")} tone="ghost" onAction={onStartOver} />
          </div>
        </div>
      ) : null}
      {run.status === "cancelled" ? (
        <NextStepBanner tone="lock" title={t("onboarding.sandbox.cancelled.title")} body={t("onboarding.sandbox.cancelled.body")} />
      ) : null}

      {startError ? (
        <p role="alert" className="text-sm text-bad">
          {startError}
        </p>
      ) : null}

      <section className="rounded-xs border border-line bg-surface" data-testid="onboarding-sandbox-repos">
        <h2 className="px-4 py-2.5 text-sm font-semibold text-ink">{t("onboarding.sandbox.reposHeading")}</h2>
        {run.repositories.length === 0 ? (
          <EmptyState size="small" title={t("onboarding.sandbox.noRepos")} />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {run.repositories.map((repo) => (
              <li key={repo.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <code className="truncate text-ink">{repo.full_name}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      {run.status !== "draft" ? (
        <section className="rounded-xs border border-line bg-surface" data-testid="onboarding-log">
          <h2 className="px-4 py-2.5 text-sm font-semibold text-ink" id="onboarding-log-heading">
            {t("onboarding.sandbox.logHeading")}
          </h2>
          <LogConsole lines={logLines} running={running} />
        </section>
      ) : null}
    </div>
  );
}

function LogConsole({ lines, running }: { lines: string[]; running: boolean }) {
  const { t } = useTranslation();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div
      ref={ref}
      role="log"
      tabIndex={0}
      aria-labelledby="onboarding-log-heading"
      aria-live="off"
      className="max-h-80 overflow-auto border-t border-line bg-surface-2 p-3 font-mono text-xs text-ink"
    >
      {lines.length === 0 ? (
        <p className="text-muted-foreground">{running ? t("onboarding.sandbox.logWaiting") : t("onboarding.sandbox.logEmpty")}</p>
      ) : (
        lines.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap break-words">
            {line}
          </div>
        ))
      )}
    </div>
  );
}
