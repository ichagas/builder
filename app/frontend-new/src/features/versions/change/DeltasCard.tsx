import * as React from "react";
import { useTranslation } from "react-i18next";
import { DeltaChip } from "@/components/shell/atoms";
import { useAddRequirementChange, type RequirementChange, type RequirementChangeKind } from "../change.api";

/**
 * Requirement deltas (NV-03 Define step). Lists the change's
 * `work_item_requirement_changes` with the shell DeltaChip and, while the
 * step is editable, a small form to record another one.
 */
export function DeltasCard({
  projectId,
  workItemId,
  shareToken,
  deltas,
  compareWith,
  isBug,
  editable,
}: {
  projectId: string;
  workItemId: string;
  shareToken: string | null;
  deltas: RequirementChange[];
  compareWith?: string;
  isBug: boolean;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const add = useAddRequirementChange(projectId, workItemId, shareToken);
  const [kind, setKind] = React.useState<RequirementChangeKind>("new");
  const [title, setTitle] = React.useState("");
  const [criterion, setCriterion] = React.useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await add.mutateAsync({ kind, title: title.trim(), criterion: criterion.trim() || null });
      setTitle("");
      setCriterion("");
    } catch {
      // surfaced through add.isError below
    }
  };

  const fieldClass = "min-h-[44px] rounded-xs border border-line bg-surface px-2 text-sm text-ink";

  return (
    <section className="rounded-xs border border-line bg-surface" aria-labelledby="change-deltas">
      <div className="flex items-center justify-between gap-2 border-b border-line px-pad py-2.5">
        <h2 id="change-deltas" className="text-sm font-semibold text-ink">
          {isBug ? t("versions.change.deltas.affected") : t("versions.change.deltas.heading")}
        </h2>
        {compareWith ? <span className="text-xs text-muted-foreground">{t("versions.change.deltas.comparedWith", { version: compareWith })}</span> : null}
      </div>
      {deltas.length === 0 ? (
        <p className="p-pad text-sm text-muted-foreground">{t("versions.change.deltas.empty")}</p>
      ) : (
        <ul className="divide-y divide-line" data-testid="requirement-deltas">
          {deltas.map((delta) => (
            <li key={delta.id} className="flex items-start gap-3 px-pad py-2.5">
              <span className="min-w-0 flex-1 text-sm">
                <b className="text-ink">{delta.title}</b>
                {delta.criterion ? (
                  <span className="block text-muted-foreground">{t("versions.change.deltas.criterion", { criterion: delta.criterion })}</span>
                ) : null}
              </span>
              <DeltaChip kind={delta.kind} />
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <form onSubmit={submit} className="flex flex-col gap-2 border-t border-line p-pad" aria-label={t("versions.change.deltas.addLabel")}>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              {t("versions.change.deltas.kind")}
              <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value as RequirementChangeKind)}>
                <option value="new">{t("versions.change.deltas.kinds.new")}</option>
                <option value="changed">{t("versions.change.deltas.kinds.changed")}</option>
                <option value="regression">{t("versions.change.deltas.kinds.regression")}</option>
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-muted-foreground">
              {t("versions.change.deltas.title")}
              <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            {t("versions.change.deltas.criterionLabel")}
            <input className={fieldClass} value={criterion} onChange={(e) => setCriterion(e.target.value)} />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!title.trim() || add.isPending}
              className="h-11 rounded-xs border border-line bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {t("versions.change.deltas.add")}
            </button>
            {add.isError ? (
              <span role="alert" className="text-sm text-bad">
                {t("versions.change.deltas.addFailed")}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

export default DeltasCard;
