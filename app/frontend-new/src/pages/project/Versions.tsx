import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { Disclosure } from "@/components/shell/Disclosure";
import { ActionButton } from "@/components/shell/ActionButton";
import { EmptyState, TypeChip, VersionTag } from "@/components/shell/atoms";
import { useUndo } from "@/lib/state/useUndo";
import { useProjectLayoutData } from "@/app/layouts/ProjectLayout";
import {
  useVersions,
  useWorkItems,
  useCreateVersion,
  useUpdateWorkItem,
  type Version,
  type WorkItem,
} from "@/features/versions/api";
import { useRealtimeVersions } from "@/features/versions/useRealtimeVersions";
import { suggestHotfixName } from "@/features/versions/timeline";
import { cn } from "@/lib/utils";

/**
 * Versions (T110, WP-V1, NV-02). The "All versions" route
 * (contracts/routes.md: `/p/:id/versions`): everything not yet scheduled
 * (triage, with a hotfix-vs-next-release suggestion per spec US4's
 * acceptance scenarios), open versions in progress, and released versions.
 *
 * Reference: docs/design/frontend-redesign/option-a-styles/shared/
 * versions.js `versionsView()`/`triageActions()`. Scheduling a change into
 * a version or an open version's own scoped tools (its changes above the
 * existing phase tool) is WP-V2/V4 -- this page only lists and triages.
 */

interface TriageActionSpec {
  label: string;
  onAction: () => void | Promise<void>;
}

function TriageRow({
  item,
  nextVersion,
  hotfixVersion,
  onScheduleHotfix,
  onScheduleNext,
  onUnschedule,
  onDecline,
  onUndoDecline,
  pushUndo,
}: {
  item: WorkItem;
  nextVersion: Version | undefined;
  hotfixVersion: Version | undefined;
  onScheduleHotfix: (item: WorkItem) => Promise<void>;
  onScheduleNext: (item: WorkItem, version: Version) => Promise<void>;
  onUnschedule: (item: WorkItem) => void;
  onDecline: (item: WorkItem) => Promise<void>;
  onUndoDecline: (item: WorkItem) => void;
  pushUndo: (entry: { text: string; undo: () => void }) => void;
}) {
  const { t } = useTranslation();
  const { projectId = "" } = useParams<{ projectId: string }>();
  const hotfixSuggested = item.type === "bug" && item.severity === "high";

  const scheduleUndo = { text: t("versions.triage.scheduledUndo", { key: item.key }), onUndo: () => onUnschedule(item) };

  const nextAction: TriageActionSpec | undefined = nextVersion
    ? { label: t("versions.triage.scheduleIn", { version: nextVersion.name }), onAction: () => onScheduleNext(item, nextVersion) }
    : undefined;
  const hotfixAction: TriageActionSpec | undefined =
    item.type === "bug"
      ? {
          label: hotfixVersion
            ? t("versions.triage.addToHotfix", { version: hotfixVersion.name })
            : t("versions.triage.startHotfix"),
          onAction: () => onScheduleHotfix(item),
        }
      : undefined;

  const [primaryAction, secondaryAction] = hotfixSuggested ? [hotfixAction, nextAction] : [nextAction, hotfixAction];
  const suggestionText = hotfixSuggested
    ? t("versions.triage.suggestHotfix")
    : item.type === "bug"
      ? t("versions.triage.suggestNextBug")
      : t("versions.triage.suggestNext");

  return (
    <Disclosure
      prefKey={`versions.triage.${item.id}`}
      summary={
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <TypeChip type={item.type} />
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>
          <span className="min-w-0 flex-1 truncate text-left">
            <b className="text-ink">{item.title}</b>
            {item.source ? <span className="ml-1.5 text-muted-foreground">{item.source}</span> : null}
            {item.severity ? <span className="ml-1.5 text-muted-foreground">· {item.severity} severity</span> : null}
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-2.5" data-testid="triage-row-body">
        {item.evidence ? <p className="text-sm text-muted-foreground">{item.evidence}</p> : null}
        <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          {suggestionText}
        </p>
        <Link className="w-fit text-sm font-semibold text-primary underline underline-offset-2" to={`/p/${projectId}/changes/${item.id}`}>
          {t("versions.change.openLink")}
        </Link>
        <div className="flex flex-wrap gap-2">
          {primaryAction ? (
            <ActionButton label={primaryAction.label} onAction={primaryAction.onAction} tone="primary" pushUndo={pushUndo} undo={scheduleUndo} />
          ) : null}
          {secondaryAction ? (
            <ActionButton label={secondaryAction.label} onAction={secondaryAction.onAction} tone="ghost" pushUndo={pushUndo} undo={scheduleUndo} />
          ) : null}
          <ActionButton
            label={t("versions.triage.decline")}
            onAction={() => onDecline(item)}
            confirm={t("versions.triage.declineConfirm")}
            tone="ghost"
            pushUndo={pushUndo}
            undo={{ text: t("versions.triage.declinedUndo", { key: item.key }), onUndo: () => onUndoDecline(item) }}
          />
        </div>
      </div>
    </Disclosure>
  );
}

const OPEN_KIND_LABEL: Record<Exclude<Version["kind"], "released">, string> = {
  building: "versions.lane.building",
  hotfix: "versions.lane.hotfix",
  next: "versions.lane.next",
  planned: "versions.lane.planned",
};

function OpenVersionRow({ version }: { version: Version }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 px-pad py-2.5" data-testid="open-version-row">
      <VersionTag version={version.name} />
      <span className="min-w-0 flex-1">
        <b className="text-ink">{t(OPEN_KIND_LABEL[version.kind as Exclude<Version["kind"], "released">])}</b>
        <span className="ml-1.5 text-sm text-muted-foreground">
          {t("versions.lane.changeCount", { count: version.work_item_count })}
          {version.work_item_count > 0 ? ` · ${t("versions.lane.activeCount", { count: version.active_work_item_count })}` : ""}
        </span>
      </span>
    </div>
  );
}

function ReleasedVersionRow({ version }: { version: Version }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 px-pad py-2.5" data-testid="released-version-row">
      <VersionTag version={version.name} locked />
      <span className="min-w-0 flex-1">
        <b className="text-ink">
          {version.is_first_release
            ? t("versions.lane.firstRelease")
            : version.is_current
              ? t("versions.lane.currentRelease")
              : t("versions.lane.released")}
        </b>
      </span>
    </div>
  );
}

export function Versions() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { shareToken } = useProjectLayoutData();
  const { data: versions, isLoading: versionsLoading, isError: versionsError } = useVersions(projectId, shareToken);
  const { data: triageItems, isLoading: triageLoading } = useWorkItems(projectId, { status: "triage" }, shareToken);
  useRealtimeVersions(projectId);

  const createVersion = useCreateVersion(projectId, shareToken);
  const updateWorkItem = useUpdateWorkItem(projectId, shareToken);
  const { push: pushUndo } = useUndo();

  const list = React.useMemo(() => versions ?? [], [versions]);
  const inbox = React.useMemo(() => (triageItems ?? []).filter((item) => !item.version_id), [triageItems]);
  const openVersions = React.useMemo(() => list.filter((v) => v.kind !== "released"), [list]);
  const releasedVersions = React.useMemo(
    () =>
      [...list]
        .filter((v) => v.kind === "released")
        .sort((a, b) => new Date(b.released_at ?? b.created_at).getTime() - new Date(a.released_at ?? a.created_at).getTime()),
    [list],
  );
  const nextVersion = openVersions.find((v) => v.kind === "next" || v.kind === "building");
  const hotfixVersion = openVersions.find((v) => v.kind === "hotfix");
  const currentReleased = releasedVersions.find((v) => v.is_current);
  const isBuildingEra = list.length > 0 && list.every((v) => v.kind === "building");

  const scheduleInto = React.useCallback(
    async (item: WorkItem, version: Version) => {
      await updateWorkItem.mutateAsync({ id: item.id, versionId: version.id });
    },
    [updateWorkItem],
  );

  const scheduleHotfix = React.useCallback(
    async (item: WorkItem) => {
      if (hotfixVersion) {
        await scheduleInto(item, hotfixVersion);
        return;
      }
      const created = await createVersion.mutateAsync({ name: suggestHotfixName(currentReleased?.name), kind: "hotfix" });
      await scheduleInto(item, created);
    },
    [hotfixVersion, createVersion, currentReleased, scheduleInto],
  );

  const decline = React.useCallback(
    async (item: WorkItem) => {
      await updateWorkItem.mutateAsync({ id: item.id, status: "declined" });
    },
    [updateWorkItem],
  );

  // Undo sinks for ActionButton's `undo` prop (contracts/design-system.md
  // §3, FR-008): best-effort, fire-and-forget -- the query invalidation
  // `useUpdateWorkItem` already does on success is what actually refreshes
  // the inbox/lanes.
  const unschedule = React.useCallback((item: WorkItem) => updateWorkItem.mutate({ id: item.id, versionId: null }), [updateWorkItem]);
  const undoDecline = React.useCallback((item: WorkItem) => updateWorkItem.mutate({ id: item.id, status: "triage" }), [updateWorkItem]);

  const title = currentReleased
    ? t("versions.title.current", { version: currentReleased.name })
    : isBuildingEra
      ? t("versions.title.building")
      : t("versions.title.default");

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader crumb={t("versions.crumb")} title={title} />

      {versionsLoading ? (
        <div role="status" className="p-9 text-center text-muted-foreground">
          {t("versions.loading")}
        </div>
      ) : versionsError ? (
        <EmptyState title={t("versions.error.title")} description={t("versions.error.description")} />
      ) : (
        <>
          {isBuildingEra ? (
            <NextStepBanner
              tone="info"
              title={t("versions.buildingBanner.title", { version: list[0]?.name ?? "" })}
              body={t("versions.buildingBanner.body")}
            />
          ) : inbox.length > 0 ? (
            <NextStepBanner
              tone="warn"
              title={t("versions.triageBanner.title", { count: inbox.length })}
              body={t("versions.triageBanner.body")}
            />
          ) : null}

          {!isBuildingEra && !triageLoading && inbox.length > 0 ? (
            <section className={cn("rounded-xs border border-line bg-surface")}>
              <div className="flex items-center justify-between border-b border-line px-pad py-2.5">
                <h2 className="text-sm font-semibold text-ink">{t("versions.notScheduled.heading")}</h2>
                <span className="text-xs text-muted-foreground">{inbox.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-1.5">
                {inbox.map((item) => (
                  <TriageRow
                    key={item.id}
                    item={item}
                    nextVersion={nextVersion}
                    hotfixVersion={hotfixVersion}
                    onScheduleHotfix={scheduleHotfix}
                    onScheduleNext={scheduleInto}
                    onUnschedule={unschedule}
                    onDecline={decline}
                    onUndoDecline={undoDecline}
                    pushUndo={pushUndo}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {openVersions.length > 0 ? (
            <section className="rounded-xs border border-line bg-surface">
              <div className="border-b border-line px-pad py-2.5">
                <h2 className="text-sm font-semibold text-ink">{t("versions.inProgress.heading")}</h2>
              </div>
              <div className="divide-y divide-line">
                {openVersions.map((version) => (
                  <OpenVersionRow key={version.id} version={version} />
                ))}
              </div>
            </section>
          ) : null}

          {releasedVersions.length > 0 ? (
            <section className="rounded-xs border border-line bg-surface">
              <div className="border-b border-line px-pad py-2.5">
                <h2 className="text-sm font-semibold text-ink">{t("versions.released.heading")}</h2>
              </div>
              <div className="divide-y divide-line">
                {releasedVersions.map((version) => (
                  <ReleasedVersionRow key={version.id} version={version} />
                ))}
              </div>
            </section>
          ) : null}

          {list.length === 0 ? <EmptyState title={t("versions.empty.title")} description={t("versions.empty.description")} /> : null}
        </>
      )}
    </div>
  );
}

export default Versions;
