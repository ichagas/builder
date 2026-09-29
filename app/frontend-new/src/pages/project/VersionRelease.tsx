import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shell/PageHeader";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { EmptyState, VersionTag } from "@/components/shell/atoms";
import { useLongTask } from "@/lib/state/useLongTask";
import { useProjectLayoutData } from "@/app/layouts/ProjectLayout";
import { useVersions, useWorkItems } from "@/features/versions/api";
import { useRealtimeVersions } from "@/features/versions/useRealtimeVersions";
import { useFirstRelease, useReleaseChecks, useReleaseVersion } from "@/features/versions/release.api";
import { ReleaseChecklist } from "@/features/versions/release/ReleaseChecklist";
import { ReleaseContents } from "@/features/versions/release/ReleaseContents";
import { usePublishReleasePrimaryAction } from "@/features/versions/release/release.primaryAction";
import {
  findBlockingVersion,
  hasFirstRelease,
  releaseErrorMessage,
  resolveReleaseTarget,
  splitChanges,
} from "@/features/versions/release/logic";

/**
 * Release (T112, WP-V3, NV-05). `/p/:id/v/:version/ship/release`
 * (contracts/routes.md). Before the first release it runs the first-release
 * checks and releases v1.0.0 (locks the baseline); afterwards it releases an
 * open version in order, carrying unfinished changes over to the next
 * version. Two-step confirm through the primary action's `confirm`.
 *
 * Reference: approach-3-versions `shared/versions.js` (`release` tool,
 * `firstRelease` / `release` actions).
 */
export function VersionRelease() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId = "", version: versionParam } = useParams<{ projectId: string; version: string }>();
  const { shareToken, refreshProject } = useProjectLayoutData();
  const { start: startLongTask } = useLongTask();
  useRealtimeVersions(projectId);

  const { data: versions, isLoading: versionsLoading, isError: versionsError } = useVersions(projectId, shareToken);
  const list = React.useMemo(() => versions ?? [], [versions]);
  const target = React.useMemo(() => resolveReleaseTarget(list, versionParam), [list, versionParam]);
  const firstRelease = !hasFirstRelease(list);
  const blocking = target && !firstRelease ? findBlockingVersion(list, target) : undefined;
  const isReleased = target?.kind === "released";

  // First release checks the implicit v1.0.0 (no versionId); later releases check the chosen version.
  const checksVersionId = firstRelease ? undefined : target?.id;
  const checksEnabled = !versionsLoading && !versionsError && !isReleased && (firstRelease || !!target);
  const { data: checks, isLoading: checksLoading, isError: checksError } = useReleaseChecks(
    projectId,
    checksVersionId,
    shareToken,
    checksEnabled,
  );
  const { data: items } = useWorkItems(projectId, { versionId: firstRelease ? undefined : target?.id }, shareToken);
  const changes = React.useMemo(() => {
    // Before the first release unscheduled changes belong to the implicit v1.0.0.
    const scoped = (items ?? []).filter((i) =>
      firstRelease ? i.version_id === null || i.version_id === target?.id : i.version_id === target?.id,
    );
    return splitChanges(scoped);
  }, [items, firstRelease, target?.id]);

  const firstReleaseMutation = useFirstRelease(projectId, shareToken);
  const releaseMutation = useReleaseVersion(projectId, shareToken);
  const [error, setError] = React.useState<string | null>(null);

  const versionName = target?.name ?? (firstRelease ? "v1.0.0" : "");
  const canRelease = !!checks?.canRelease && !blocking && !isReleased && (firstRelease || !!target);

  const release = React.useCallback(async () => {
    setError(null);
    const handle = startLongTask({
      id: `release-${projectId}-${versionName}`,
      label: t("versions.release.task", { version: versionName }),
      href: `/p/${projectId}/v/${versionName}/ship/release`,
    });
    try {
      if (firstRelease) await firstReleaseMutation.mutateAsync();
      else if (target) await releaseMutation.mutateAsync({ versionId: target.id });
      handle.done();
    } catch (err) {
      handle.fail();
      setError(releaseErrorMessage(err, t("versions.release.error.failed")));
      throw err;
    }
    refreshProject();
    navigate(`/p/${projectId}/versions`);
  }, [firstRelease, firstReleaseMutation, releaseMutation, target, projectId, versionName, startLongTask, refreshProject, navigate, t]);

  usePublishReleasePrimaryAction(
    target || firstRelease
      ? {
          label: t("versions.release.action", { version: versionName }),
          confirm: t("versions.release.confirm", { version: versionName }),
          onClick: release,
          disabled: !canRelease || releaseMutation.isPending || firstReleaseMutation.isPending,
          disabledReason: blocking
            ? t("versions.release.blocked.reason", { version: blocking.name })
            : isReleased
              ? t("versions.release.locked.title", { version: versionName })
              : t("versions.release.checks.incomplete"),
        }
      : undefined,
  );

  const title = t("versions.release.title", { version: versionName || t("versions.release.unknown") });

  let body: React.ReactNode;
  if (versionsLoading) {
    body = (
      <div role="status" className="p-9 text-center text-muted-foreground">
        {t("versions.release.loading")}
      </div>
    );
  } else if (versionsError) {
    body = <EmptyState title={t("versions.error.title")} description={t("versions.error.description")} />;
  } else if (!target && !firstRelease) {
    body = <EmptyState title={t("versions.release.notFound.title")} description={t("versions.release.notFound.description")} />;
  } else if (isReleased && target) {
    body = (
      <>
        <NextStepBanner tone="lock" title={t("versions.release.locked.title", { version: target.name })} body={t("versions.release.locked.body")} />
        <ReleaseContents versionName={target.name} shipped={changes.shipped} carry={[]} firstRelease />
      </>
    );
  } else {
    body = (
      <>
        {blocking ? (
          <NextStepBanner
            tone="warn"
            title={t("versions.release.blocked.title", { version: blocking.name })}
            body={t("versions.release.blocked.body")}
          />
        ) : firstRelease ? (
          <NextStepBanner
            tone={canRelease ? "ok" : "info"}
            title={canRelease ? t("versions.release.first.readyTitle", { version: versionName }) : t("versions.release.first.title")}
            body={t("versions.release.first.body")}
          />
        ) : canRelease ? (
          <NextStepBanner tone="ok" title={t("versions.release.ready.title", { version: versionName })} body={t("versions.release.ready.body")} />
        ) : null}
        {blocking ? (
          <p>
            <Link className="font-semibold text-primary underline" to={`/p/${projectId}/v/${blocking.name}/ship/release`}>
              {t("versions.release.blocked.open", { version: blocking.name })}
            </Link>
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-xs border border-bad/40 bg-bad-soft p-3 text-sm text-ink" data-testid="release-error">
            {error}
          </div>
        ) : null}
        {checksLoading ? (
          <div role="status" className="p-6 text-center text-muted-foreground">
            {t("versions.release.checks.loading")}
          </div>
        ) : checksError || !checks ? (
          <EmptyState title={t("versions.release.checks.errorTitle")} description={t("versions.release.checks.errorDescription")} />
        ) : (
          <ReleaseChecklist checks={checks.checks} firstRelease={firstRelease} versionName={versionName} />
        )}
        <ReleaseContents versionName={versionName} shipped={changes.shipped} carry={changes.carry} firstRelease={firstRelease} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader crumb={t("versions.crumb")} title={title} />
      {target ? (
        <div className="flex items-center gap-2">
          <VersionTag version={target.name} locked={isReleased} />
          <span className="text-sm text-muted-foreground">{t(`versions.lane.${target.kind === "released" ? "released" : target.kind}`)}</span>
        </div>
      ) : null}
      {body}
    </div>
  );
}

export default VersionRelease;
