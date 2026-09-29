import { Check, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ReleaseCheck } from "../shared";
import type { StepStates } from "./steps";

/**
 * Checks (NV-03 Ship step): this change's own readiness (derived from its
 * steps) followed by the checks its version has to pass to release
 * (`GET /release-checks?versionId=`).
 */
export function ChecksCard({
  states,
  versionChecks,
  versionName,
  loading,
}: {
  states: StepStates;
  versionChecks: ReleaseCheck[] | undefined;
  versionName?: string;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const own: ReleaseCheck[] = [
    { id: "define", label: t("versions.change.checks.define"), passed: states.define === "done" },
    {
      id: "design",
      label: t("versions.change.checks.design"),
      passed: states.design === "done" || states.design === "skipped",
    },
    { id: "build", label: t("versions.change.checks.build"), passed: states.build === "done" },
  ];
  const rows = [...own, ...(versionChecks ?? [])];

  return (
    <section className="rounded-xs border border-line bg-surface" aria-labelledby="change-checks">
      <div className="flex items-center justify-between gap-2 border-b border-line px-pad py-2.5">
        <h2 id="change-checks" className="text-sm font-semibold text-ink">
          {t("versions.change.checks.heading")}
        </h2>
        {versionName ? <span className="text-xs text-muted-foreground">{t("versions.change.checks.forVersion", { version: versionName })}</span> : null}
      </div>
      <ul className="divide-y divide-line" data-testid="change-checks">
        {rows.map((check) => (
          <li key={check.id} className="flex items-start gap-2.5 px-pad py-2.5 text-sm" data-passed={check.passed}>
            {check.passed ? (
              <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            ) : (
              <Circle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1">
              <b className={cn("text-ink")}>{check.label}</b>
              {check.detail ? <span className="block text-muted-foreground">{check.detail}</span> : null}
            </span>
            <span className="text-xs text-muted-foreground">{check.passed ? t("versions.change.checks.passing") : t("versions.change.checks.waiting")}</span>
          </li>
        ))}
        {loading ? (
          <li role="status" className="px-pad py-2.5 text-sm text-muted-foreground">
            {t("versions.change.checks.loading")}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

export default ChecksCard;
