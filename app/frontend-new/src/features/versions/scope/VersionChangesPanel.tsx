import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { DeltaChip, TypeChip, VersionTag } from "@/components/shell/atoms";
import { useOpenVersionChanges } from "../scope.api";
import type { Version } from "../api";

/**
 * Deltas of an open version's changes, rendered above the existing phase
 * tool (NV-06, T113): each change with the requirement deltas recorded
 * against it (`new` / `changed` / `regression`).
 */
export function VersionChangesPanel({
  projectId,
  version,
  shareToken,
}: {
  projectId: string;
  version: Version;
  shareToken?: string | null;
}) {
  const { t } = useTranslation();
  const { isLoading, isError, changes } = useOpenVersionChanges(projectId, version.id, shareToken);

  return (
    <section
      aria-labelledby="version-scope-changes-heading"
      data-testid="version-scope-changes"
      className="rounded-xs border border-line bg-surface p-pad"
    >
      <div className="flex flex-wrap items-center gap-2">
        <VersionTag version={version.name} />
        <h2 id="version-scope-changes-heading" className="text-base font-semibold text-ink">
          {t("versions.scope.open.heading", { version: version.name })}
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("versions.scope.open.body")}</p>

      {isLoading ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {t("versions.scope.open.loading")}
        </p>
      ) : isError ? (
        <p role="alert" className="mt-3 text-sm text-bad">
          {t("versions.scope.open.error")}
        </p>
      ) : changes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="version-scope-empty">
          {t("versions.scope.open.empty")}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {changes.map(({ item, deltas, isLoadingDeltas }) => (
            <li key={item.id} data-testid="version-scope-change" className="flex flex-col gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <TypeChip type={item.type} />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>
                <Link
                  to={`/p/${projectId}/changes/${item.id}`}
                  className="inline-flex min-h-11 min-w-0 items-center font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {item.title}
                </Link>
              </div>
              {isLoadingDeltas ? null : deltas.length === 0 ? (
                <p className="pl-1 text-sm text-muted-foreground">{t("versions.scope.open.noDeltas")}</p>
              ) : (
                <ul className="flex flex-col gap-1 pl-1">
                  {deltas.map((delta, index) => (
                    <li key={`${delta.requirement_id ?? "new"}-${index}`} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <DeltaChip kind={delta.kind}>{t(`versions.scope.delta.${delta.kind}`)}</DeltaChip>
                      <span className="text-ink">{delta.title}</span>
                      {delta.criterion ? <span className="text-muted-foreground">{delta.criterion}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
