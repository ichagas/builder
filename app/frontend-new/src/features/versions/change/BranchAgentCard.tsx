import { GitBranch } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AgentSession } from "../change.api";

/**
 * Branch and agent (NV-03 Build step): the change's real Git branch
 * (`work_items.branch`), where it merges, the linked agent session's state
 * and the preview once sent for review.
 */
export function BranchAgentCard({
  projectId,
  branch,
  versionName,
  session,
  hasSession,
  previewUrl,
}: {
  projectId: string;
  branch: string | null;
  versionName?: string;
  session: AgentSession | null | undefined;
  hasSession: boolean;
  previewUrl: string | null;
}) {
  const { t } = useTranslation();
  const running = session?.status === "running";
  return (
    <section className="rounded-xs border border-line bg-surface" aria-labelledby="change-branch">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-pad py-2.5">
        <h2 id="change-branch" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <GitBranch aria-hidden="true" className="h-4 w-4" />
          <span className="font-mono" data-testid="change-branch">
            {branch ?? t("versions.change.build.noBranch")}
          </span>
        </h2>
        {versionName ? <span className="text-xs text-muted-foreground">{t("versions.change.build.mergesInto", { version: versionName })}</span> : null}
      </div>
      <div className="flex flex-col gap-2 p-pad text-sm">
        {!branch ? <p className="text-muted-foreground">{t("versions.change.build.noBranchHint")}</p> : null}
        <p data-testid="change-agent-status">
          <b className="text-ink">{t("versions.change.build.agent")}</b>{" "}
          <span className="text-muted-foreground">
            {!hasSession
              ? t("versions.change.build.agentIdle")
              : running
                ? t("versions.change.build.agentRunning")
                : session
                  ? t("versions.change.build.agentStatus", { status: session.status })
                  : t("versions.change.build.agentUnknown")}
          </span>{" "}
          {hasSession ? (
            <Link className="font-semibold text-primary underline underline-offset-2" to={`/p/${projectId}/v/current/build/agent`}>
              {t("versions.change.build.openAgent")}
            </Link>
          ) : null}
        </p>
        {previewUrl ? (
          <p>
            <b className="text-ink">{t("versions.change.build.preview")}</b>{" "}
            <a className="font-semibold text-primary underline underline-offset-2" href={previewUrl} target="_blank" rel="noreferrer">
              {previewUrl}
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default BranchAgentCard;
