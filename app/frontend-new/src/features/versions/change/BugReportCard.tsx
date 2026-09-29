import { useTranslation } from "react-i18next";
import { bugReportSchema } from "../change.api";

/** Bug report (NV-03 Define step): steps, expected, actual, environment from `work_items.bug_report`. */
export function BugReportCard({ report, foundIn }: { report: unknown; foundIn?: string }) {
  const { t } = useTranslation();
  const parsed = bugReportSchema.safeParse(report ?? {});
  const data = parsed.success ? parsed.data : {};
  const hasContent = !!(data.steps?.length || data.expected || data.actual || data.environment);

  return (
    <section className="rounded-xs border border-line bg-surface" aria-labelledby="change-bug-report">
      <div className="flex items-center justify-between gap-2 border-b border-line px-pad py-2.5">
        <h2 id="change-bug-report" className="text-sm font-semibold text-ink">
          {t("versions.change.bug.heading")}
        </h2>
        {foundIn ? <span className="text-xs text-muted-foreground">{t("versions.change.bug.foundIn", { version: foundIn })}</span> : null}
      </div>
      {hasContent ? (
        <dl className="flex flex-col gap-3 p-pad text-sm">
          {data.steps?.length ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("versions.change.bug.steps")}</dt>
              <dd>
                <ol className="ml-5 list-decimal">
                  {data.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </dd>
            </div>
          ) : null}
          {data.expected ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("versions.change.bug.expected")}</dt>
              <dd>{data.expected}</dd>
            </div>
          ) : null}
          {data.actual ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("versions.change.bug.actual")}</dt>
              <dd>{data.actual}</dd>
            </div>
          ) : null}
          {data.environment ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("versions.change.bug.environment")}</dt>
              <dd>{data.environment}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="p-pad text-sm text-muted-foreground">{t("versions.change.bug.empty")}</p>
      )}
    </section>
  );
}

export default BugReportCard;
