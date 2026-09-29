import * as React from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { ReadOnlyProvider } from "@/components/shell/ReadOnlyContext";
import { useProjectLayoutData } from "@/app/layouts/ProjectLayout";
import { isUnscopedSegment, useVersionScope } from "../scope.api";
import { VersionScopeContext } from "./context";
import { ReadOnlyGuard } from "./ReadOnlyGuard";
import { VersionChangesPanel } from "./VersionChangesPanel";

/**
 * VersionScope (T113, WP-V4, NV-06). The one wrapper the router puts around
 * every phase-tool route element (`app/router.tsx`).
 *
 * - `v/current/...` (and the D-7 synthetic "building" id): a pure
 *   passthrough, so the PR-xx regression routes render exactly as before.
 * - Any other version segment fails closed: while the versions list is
 *   resolving, when it fails to load, and for a released version the tool is
 *   read-only (native controls disabled except navigation, `PageHeader`'s
 *   primary action disabled through `ReadOnlyProvider`, and
 *   `useVersionScopeContext().readOnly` for tools that can do better). The
 *   tool stays at the same tree position in every state, so it does not
 *   remount when the version resolves.
 * - `v/<open version>/...`: that version's changes and their requirement
 *   deltas above the untouched tool.
 */
export function VersionScope({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { versionId } = useParams<{ versionId?: string }>();
  const { projectId, shareToken } = useProjectLayoutData();
  const scope = useVersionScope(projectId, versionId, shareToken);

  const released = scope.mode === "released";
  const readOnly = released || scope.isResolving || scope.isError;
  const reason = t(
    released ? "versions.scope.released.actionDisabled" : scope.isError ? "versions.scope.error.actionDisabled" : "versions.scope.loading.actionDisabled",
  );

  const value = React.useMemo(() => ({ readOnly, version: scope.version }), [readOnly, scope.version]);
  const readOnlyValue = React.useMemo(() => ({ readOnly, reason: readOnly ? reason : undefined }), [readOnly, reason]);

  if (isUnscopedSegment(versionId)) {
    return <>{children}</>;
  }

  return (
    <VersionScopeContext.Provider value={value}>
      <ReadOnlyProvider value={readOnlyValue}>
        <div className="flex flex-col gap-3" data-testid="version-scope" data-scope-mode={scope.mode}>
          {scope.isResolving ? (
            <NextStepBanner tone="lock" title={t("versions.scope.loading.title")} body={t("versions.scope.loading.body")} />
          ) : null}
          {scope.isError ? (
            <NextStepBanner tone="warn" title={t("versions.scope.error.title")} body={t("versions.scope.error.body")} />
          ) : null}
          {scope.isUnknown ? (
            <NextStepBanner tone="warn" title={t("versions.scope.unknown.title")} body={t("versions.scope.unknown.body")} />
          ) : null}
          {released && scope.version ? (
            <NextStepBanner
              tone="lock"
              title={t("versions.scope.released.title", { version: scope.version.name })}
              body={t("versions.scope.released.body")}
            />
          ) : null}
          {scope.mode === "open" && scope.version ? (
            <VersionChangesPanel projectId={projectId} version={scope.version} shareToken={shareToken} />
          ) : null}
          <ReadOnlyGuard active={readOnly} data-testid={readOnly ? "version-scope-readonly" : undefined}>
            {children}
          </ReadOnlyGuard>
        </div>
      </ReadOnlyProvider>
    </VersionScopeContext.Provider>
  );
}

export default VersionScope;
