import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shell/PageHeader";
import { NextStepBanner, type NextStepBannerProps } from "@/components/shell/NextStepBanner";
import { EmptyState, TypeChip } from "@/components/shell/atoms";
import type { ActionSpec } from "@/components/shell/types";
import { useProjectLayoutData } from "@/app/layouts/ProjectLayout";
import { useUpdateWorkItem, useVersions } from "@/features/versions/api";
import {
  useAgentSession,
  useCanvasGraph,
  useCompleteStep,
  useRequirementChanges,
  useUnskipDesign,
  useVersionChecks,
  useWorkItem,
  type PhaseStep,
} from "@/features/versions/change.api";
import { useRealtimeVersions } from "@/features/versions/useRealtimeVersions";
import { useRealtimeWorkItem } from "@/features/versions/change/useRealtimeWorkItem";
import { ChangeStepBar } from "@/features/versions/change/ChangeStepBar";
import { BugReportCard } from "@/features/versions/change/BugReportCard";
import { DeltasCard } from "@/features/versions/change/DeltasCard";
import { ScopedCanvas } from "@/features/versions/change/ScopedCanvas";
import { BranchAgentCard } from "@/features/versions/change/BranchAgentCard";
import { ChecksCard } from "@/features/versions/change/ChecksCard";
import { VersionPicker } from "@/features/versions/change/VersionPicker";
import { isLocked, resolveStep, stepAction, stepAfterDefine, stepStates } from "@/features/versions/change/steps";
import { usePublishChangePrimaryAction } from "./change.primaryAction";

/**
 * Change page (T111, WP-V2, NV-03/NV-04). One change, one page
 * (contracts/routes.md: `/p/:projectId/changes/:changeId/:step?`): a step
 * bar (Define, Design, Build, Ship), the bug report and requirement deltas,
 * the scoped canvas, branch and agent, checks, and a version picker.
 *
 * Reference: docs/design/frontend-redesign/option-a-styles/shared/
 * versions.js `changeView()`.
 */
export function Change() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId = "", changeId, step: stepParam } = useParams<{ projectId: string; changeId: string; step?: string }>();
  const { shareToken, role } = useProjectLayoutData();

  const { data: versions = [] } = useVersions(projectId, shareToken);
  const itemQuery = useWorkItem(projectId, changeId, shareToken);
  const item = itemQuery.data && itemQuery.data.project_id === projectId ? itemQuery.data : undefined;
  useRealtimeVersions(projectId);
  useRealtimeWorkItem(projectId, changeId);

  const states = React.useMemo(() => stepStates(item ?? { phase_state: null }), [item]);
  const step = resolveStep(stepParam, states);
  const version = versions.find((v) => v.id === item?.version_id);
  const versionReleased = version?.kind === "released";
  const viewerOnly = role === "viewer";
  const locked = !item || isLocked(item, versionReleased) || viewerOnly;

  const deltasQuery = useRequirementChanges(projectId, changeId, shareToken);
  const canvasQuery = useCanvasGraph(projectId, shareToken, step === "design" && states.design !== "skipped");
  const sessionQuery = useAgentSession(projectId, item?.agent_session_id, shareToken);
  const checksQuery = useVersionChecks(projectId, step === "ship" ? item?.version_id : undefined, shareToken);

  const completeStep = useCompleteStep(projectId, changeId, shareToken);
  const unskipDesign = useUnskipDesign(projectId, changeId, shareToken);
  const updateItem = useUpdateWorkItem(projectId, shareToken);
  const [actionError, setActionError] = React.useState(false);

  const goToStep = React.useCallback(
    (next: PhaseStep) => navigate(`/p/${projectId}/changes/${changeId}/${next}`),
    [navigate, projectId, changeId],
  );

  const agentRunning = sessionQuery.data?.status === "running";
  const action = stepAction(step, states, { locked, agentRunning });

  const primary: ActionSpec | undefined = React.useMemo(() => {
    if (!action || !item) return undefined;
    const disabledReason = action.disabledReasonKey ? t(action.disabledReasonKey) : undefined;
    const base = { disabled: !!action.disabledReasonKey, disabledReason };
    const run = (fn: () => Promise<void> | void) => async () => {
      setActionError(false);
      try {
        await fn();
      } catch {
        setActionError(true);
      }
    };
    switch (action.action.kind) {
      case "complete": {
        const done = action.action.step;
        const label = t(`versions.change.action.${done}`);
        return {
          label,
          ...base,
          onClick: run(async () => {
            await completeStep.mutateAsync(done);
            goToStep(done === "define" ? stepAfterDefine(states) : done === "design" ? "build" : "ship");
          }),
        };
      }
      case "unskip":
        return { label: t("versions.change.action.unskip"), ...base, onClick: run(async () => void (await unskipDesign.mutateAsync())) };
      case "openRelease":
        return {
          label: t("versions.change.action.openRelease", { version: version?.name ?? "" }),
          disabled: !version,
          disabledReason: t("versions.change.action.notScheduled"),
          tone: "primary" as const,
          onClick: () => navigate(`/p/${projectId}/v/${version?.name}/ship/release`),
        };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.action.kind, action?.disabledReasonKey, item?.id, states, version?.name, projectId, completeStep.mutateAsync, unskipDesign.mutateAsync, goToStep]);

  usePublishChangePrimaryAction(primary);

  if (itemQuery.isLoading) {
    return (
      <div role="status" className="p-9 text-center text-muted-foreground">
        {t("versions.change.loading")}
      </div>
    );
  }
  if (!item) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <PageHeader crumb={t("versions.crumb")} title={t("versions.change.notFound.title")} />
        <EmptyState title={t("versions.change.notFound.title")} description={t("versions.change.notFound.description")} />
      </div>
    );
  }

  const deltas = deltasQuery.data ?? [];
  const isBug = item.type === "bug";
  const changeVersion = version?.name ?? "";

  const banner = ((): NextStepBannerProps | null => {
    if (item.status === "declined") return { tone: "lock", title: t("versions.change.banner.declined.title"), body: t("versions.change.banner.declined.body") };
    if (item.status === "shipped" || versionReleased)
      return { tone: "lock", title: t("versions.change.banner.locked.title", { version: changeVersion }), body: t("versions.change.banner.locked.body") };
    if (viewerOnly) return { tone: "lock", title: t("versions.change.banner.viewer.title"), body: t("versions.change.banner.viewer.body") };
    if (!item.version_id) return { tone: "warn", title: t("versions.change.banner.unscheduled.title"), body: t("versions.change.banner.unscheduled.body") };
    const state = states[step];
    if (step === "define")
      return state === "active"
        ? { tone: "info", title: t("versions.change.banner.define.title"), body: t("versions.change.banner.define.body") }
        : {
            tone: "ok",
            title: t("versions.change.banner.defineDone.title"),
            body: t("versions.change.banner.defineDone.body"),
            cta: { label: t("versions.change.banner.goTo", { step: t(`versions.change.steps.${stepAfterDefine(states)}`) }), onClick: () => goToStep(stepAfterDefine(states)) },
          };
    if (step === "design")
      return state === "skipped"
        ? { tone: "info", title: t("versions.change.banner.designSkipped.title"), body: t("versions.change.banner.designSkipped.body") }
        : { tone: "info", title: t("versions.change.banner.design.title", { count: item.components.length }), body: t("versions.change.banner.design.body") };
    if (step === "build") {
      if (state === "todo") return { tone: "info", title: t("versions.change.banner.buildTodo.title"), body: t("versions.change.banner.buildTodo.body", { branch: item.branch ?? "" }) };
      if (agentRunning) return { tone: "info", title: t("versions.change.banner.buildRunning.title", { branch: item.branch ?? "" }), body: t("versions.change.banner.buildRunning.body") };
      return { tone: "ok", title: t("versions.change.banner.buildReview.title"), body: t("versions.change.banner.buildReview.body", { version: changeVersion }) };
    }
    return states.build === "done"
      ? { tone: "ok", title: t("versions.change.banner.shipReady.title", { version: changeVersion }), body: t("versions.change.banner.shipReady.body", { version: changeVersion }) }
      : { tone: "info", title: t("versions.change.banner.shipNotReady.title", { version: changeVersion }), body: t("versions.change.banner.shipNotReady.body") };
  })();

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader crumb={`${changeVersion || t("versions.change.unscheduled")} / ${item.key}`} title={item.title} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="change-head">
        <TypeChip type={item.type} />
        <span className="font-mono text-xs text-muted-foreground">{item.key}</span>
        {item.severity ? <span className="rounded-xs bg-bad-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-bad">{t("versions.change.severity", { severity: item.severity })}</span> : null}
        {item.branch ? <span className="font-mono text-xs text-muted-foreground">{item.branch}</span> : null}
        {item.source ? <span className="text-sm text-muted-foreground">{item.source}</span> : null}
        <span className="sm:ml-auto">
          <VersionPicker
            itemKey={item.key}
            versions={versions}
            value={item.version_id}
            disabled={locked}
            onChange={(versionId) => {
              setActionError(false);
              updateItem.mutate({ id: item.id, versionId }, { onError: () => setActionError(true) });
            }}
          />
        </span>
      </div>

      <ChangeStepBar itemKey={item.key} states={states} notes={item.phase_notes} current={step} onSelect={goToStep} />

      {actionError ? (
        <p role="alert" className="text-sm text-bad">
          {t("versions.change.actionFailed")}
        </p>
      ) : null}

      {banner ? <NextStepBanner {...banner} /> : null}

      {step === "define" ? (
        <>
          {isBug ? <BugReportCard report={item.bug_report} foundIn={versions.find((v) => v.is_current)?.name} /> : null}
          <DeltasCard
            projectId={projectId}
            workItemId={item.id}
            shareToken={shareToken}
            deltas={deltas}
            compareWith={versions.find((v) => v.is_current)?.name}
            isBug={isBug}
            editable={!locked && states.define === "active"}
          />
        </>
      ) : null}

      {step === "design" && states.design !== "skipped" ? (
        canvasQuery.isLoading ? (
          <div role="status" className="p-6 text-center text-muted-foreground">
            {t("versions.change.canvas.loading")}
          </div>
        ) : canvasQuery.isError ? (
          <EmptyState title={t("versions.change.canvas.errorTitle")} description={t("versions.change.canvas.errorDescription")} />
        ) : (
          <ScopedCanvas
            nodes={canvasQuery.data?.nodes ?? []}
            edges={canvasQuery.data?.edges ?? []}
            affectedIds={item.components}
            versionLabel={changeVersion}
          />
        )
      ) : null}

      {step === "build" && states.build !== "todo" ? (
        <BranchAgentCard
          projectId={projectId}
          branch={item.branch}
          versionName={changeVersion}
          session={sessionQuery.data}
          hasSession={!!item.agent_session_id}
          previewUrl={item.preview_url}
        />
      ) : null}

      {step === "ship" ? (
        <ChecksCard
          states={states}
          versionChecks={checksQuery.data?.checks}
          versionName={changeVersion}
          loading={checksQuery.isLoading && !!item.version_id}
        />
      ) : null}
    </div>
  );
}

export default Change;
