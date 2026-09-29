import * as React from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { useProjectLayoutData } from "@/app/layouts/ProjectLayout";
import { useVersionScope } from "../scope.api";
import { VersionScopeContext } from "./context";
import { VersionChangesPanel } from "./VersionChangesPanel";

/**
 * VersionScope (T113, WP-V4, NV-06). The one wrapper the router puts around
 * every phase-tool route element (`app/router.tsx`).
 *
 * - `v/current/...` (and the D-7 synthetic "building" id): a pure
 *   passthrough, so the PR-xx regression routes render exactly as before.
 * - `v/<released version>/...`: a lock banner, and the tool inside a
 *   disabled `<fieldset>` (no native control can change anything). Tools can
 *   also read `useVersionScopeContext().readOnly`.
 * - `v/<open version>/...`: that version's changes and their requirement
 *   deltas above the untouched tool.
 */
export function VersionScope({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { versionId } = useParams<{ versionId?: string }>();
  const { projectId, shareToken } = useProjectLayoutData();
  const scope = useVersionScope(projectId, versionId, shareToken);

  const value = React.useMemo(
    () => ({ readOnly: scope.mode === "released", version: scope.version }),
    [scope.mode, scope.version],
  );

  if (scope.mode === "none" && !scope.isUnknown) {
    return <>{children}</>;
  }

  return (
    <VersionScopeContext.Provider value={value}>
      <div className="flex flex-col gap-3" data-testid="version-scope" data-scope-mode={scope.mode}>
        {scope.isUnknown ? (
          <NextStepBanner tone="warn" title={t("versions.scope.unknown.title")} body={t("versions.scope.unknown.body")} />
        ) : null}
        {scope.mode === "released" && scope.version ? (
          <NextStepBanner
            tone="lock"
            title={t("versions.scope.released.title", { version: scope.version.name })}
            body={t("versions.scope.released.body")}
          />
        ) : null}
        {scope.mode === "open" && scope.version ? (
          <VersionChangesPanel projectId={projectId} version={scope.version} shareToken={shareToken} />
        ) : null}
        {scope.mode === "released" ? (
          // `contents` keeps the tool's own layout; `disabled` blocks every native control inside.
          <fieldset disabled className="contents" data-testid="version-scope-readonly">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </div>
    </VersionScopeContext.Provider>
  );
}

export default VersionScope;
