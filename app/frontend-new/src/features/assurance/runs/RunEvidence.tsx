import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "@/components/shell/ActionButton";
import { EmptyState, PrChip } from "@/components/shell/atoms";
import { cn } from "@/lib/utils";
import { MESH_AGENTS } from "../api";
import { useMeshRun, useOpenRunIssue, type MeshRunEvidence } from "../runs.api";

const VERDICT_TONE: Record<string, string> = {
  pass: "border-line-2 text-ink",
  warn: "border-warn text-ink",
  fail: "border-bad text-bad",
  skip: "border-line-2 text-muted-foreground",
  none: "border-line-2 text-muted-foreground",
};

/** Only an https report link is rendered as a link (the backend enforces this too; defense in depth). */
function safeReportUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-ink">{children}</dd>
    </div>
  );
}

function EvidenceBody({ run, appId }: { run: MeshRunEvidence; appId: string }) {
  const { t } = useTranslation();
  const openIssue = useOpenRunIssue(appId);
  const report = safeReportUrl(run.report_url);
  const issueResult = openIssue.data;

  return (
    <div className="grid gap-3" data-testid="assurance-run-evidence">
      <ul className="grid gap-1.5 sm:grid-cols-2" aria-label={t("assurance.runs.evidence.verdictsLabel") ?? undefined}>
        {MESH_AGENTS.map((agent) => {
          const verdict = run.verdicts[agent] ?? "none";
          return (
            <li key={agent} className="flex items-center justify-between gap-2 rounded-xs border border-line px-2.5 py-1.5">
              <span className="text-sm font-medium text-ink">{t(`assurance.runs.agent.${agent}`)}</span>
              <span
                data-testid={`assurance-run-verdict-${agent}`}
                className={cn("rounded-xs border px-2 py-0.5 text-xs font-semibold", VERDICT_TONE[verdict])}
              >
                {t(`assurance.runs.verdict.${verdict}`)}
              </span>
            </li>
          );
        })}
      </ul>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label={t("assurance.runs.evidence.newFindings")}>{run.new_findings}</Fact>
        <Fact label={t("assurance.runs.evidence.asvs")}>{run.asvs_passed ?? "—"}</Fact>
        <Fact label={t("assurance.runs.evidence.alberta")}>{run.alberta_passed ?? "—"}</Fact>
        <Fact label={t("assurance.runs.evidence.pack")}>{run.pack_version ?? "—"}</Fact>
        <Fact label={t("assurance.runs.evidence.commit")}>
          <code className="font-mono text-[13px]">{run.commit_sha.slice(0, 12)}</code>
        </Fact>
        <Fact label={t("assurance.runs.evidence.trigger")}>{run.trigger}</Fact>
        <Fact label={t("assurance.runs.evidence.received")}>{new Date(run.received_at).toLocaleString()}</Fact>
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        {report ? (
          <a
            href={report}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
          >
            {t("assurance.runs.evidence.report")}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">{t("assurance.runs.evidence.noReport")}</span>
        )}
        {run.new_findings > 0 ? (
          <ActionButton
            label={t("assurance.runs.evidence.openIssue")}
            confirm={t("assurance.runs.evidence.openIssueConfirm") ?? undefined}
            tone="ghost"
            onAction={async () => {
              await openIssue.mutateAsync(run.id);
            }}
          />
        ) : null}
      </div>
      {issueResult ? (
        <p role="status" className="text-sm text-ink" data-testid="assurance-run-issue-result">
          {issueResult.created
            ? t("assurance.runs.evidence.issueCreated", { ref: issueResult.issueRef ?? "" })
            : (issueResult.message ?? t("assurance.runs.evidence.issueExisting"))}
        </p>
      ) : null}
    </div>
  );
}

export function RunEvidence({ runId, appId }: { runId: string; appId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useMeshRun(runId);

  return (
    <section
      aria-label={t("assurance.runs.evidence.heading") ?? undefined}
      className="border-t border-line bg-surface-2 p-pad"
    >
      {isLoading ? (
        <div role="status" className="p-4 text-center text-sm text-muted-foreground">
          {t("assurance.runs.evidence.loading")}
        </div>
      ) : isError || !data ? (
        <EmptyState size="small" title={t("assurance.runs.evidence.error")} />
      ) : (
        <EvidenceBody run={data} appId={appId} />
      )}
    </section>
  );
}

export function RunPrChip({ number, state }: { number: number | null; state: string | null }) {
  const { t } = useTranslation();
  if (number === null) return <PrChip state="none">{t("assurance.runs.noPr")}</PrChip>;
  return <PrChip number={number} state={state === "merged" ? "merged" : "open"} />;
}
