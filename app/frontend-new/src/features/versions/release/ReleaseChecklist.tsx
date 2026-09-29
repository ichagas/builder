import { Check, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ReleaseCheck } from "../release.api";
import { isInformationalCheck } from "./logic";

/**
 * Release checks (NV-05). One row per backend check: pass, fail (blocks),
 * or informational (deployment; unfinished changes after the first
 * release, which carry over instead of blocking). Prototype:
 * approach-3-versions `.chk` rows.
 */
export function ReleaseChecklist({
  checks,
  firstRelease,
  versionName,
}: {
  checks: ReleaseCheck[];
  firstRelease: boolean;
  versionName: string;
}) {
  const { t } = useTranslation();
  const passing = checks.filter((c) => c.passed).length;
  return (
    <section className="rounded-xs border border-line bg-surface" aria-labelledby="release-checks-heading">
      <div className="flex items-center justify-between border-b border-line px-pad py-2.5">
        <h2 id="release-checks-heading" className="text-sm font-semibold text-ink">
          {t("versions.release.checks.heading", { version: versionName })}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("versions.release.checks.count", { passing, total: checks.length })}
        </span>
      </div>
      <ul className="divide-y divide-line" data-testid="release-checks">
        {checks.map((check) => {
          const informational = !check.passed && isInformationalCheck(check, firstRelease);
          const state = check.passed ? "pass" : informational ? "info" : "fail";
          return (
            <li key={check.id} className="flex items-start gap-3 px-pad py-2.5" data-check={check.id} data-state={state}>
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  state === "pass" && "border-ok/40 bg-ok-soft text-ok",
                  state === "fail" && "border-bad/40 bg-bad-soft text-bad",
                  state === "info" && "border-line bg-surface-2 text-muted-foreground",
                )}
              >
                {state === "pass" ? <Check className="h-3 w-3" /> : state === "fail" ? <X className="h-3 w-3" /> : <Info className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="text-ink">{check.label}</b>
                <span className="sr-only">
                  {" "}
                  {t(`versions.release.checks.state.${state}`)}
                </span>
                {check.detail ? <span className="block text-sm text-muted-foreground">{check.detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ReleaseChecklist;
