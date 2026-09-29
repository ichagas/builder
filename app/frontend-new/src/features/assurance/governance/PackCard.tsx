import { useTranslation } from "react-i18next";
import { DeltaChip } from "@/components/shell/atoms";
import { normalizePackChanges, type StandardsPack } from "@/features/assurance/governance.api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** One Standards pack: version, published date, notes, changes, and how many repos in the team are on it. */
export function PackCard({ pack, latest, repoCount }: { pack: StandardsPack; latest: boolean; repoCount: number | null }) {
  const { t } = useTranslation();
  const changes = normalizePackChanges(pack.changes);
  return (
    <section className="rounded-xs border border-line bg-surface" data-testid="governance-pack-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-pad py-2.5">
        <span className="font-mono text-sm font-bold text-ink">{pack.version}</span>
        <h2 className="text-sm font-semibold text-ink">{latest ? t("assurance.governance.packs.latest") : t("assurance.governance.packs.pack")}</h2>
        <span className="text-xs text-muted-foreground">
          {formatDate(pack.published_at)}
          {repoCount !== null ? ` · ${t("assurance.governance.packs.repos", { count: repoCount })}` : ""}
        </span>
      </div>
      {pack.notes ? <p className="px-pad py-2.5 text-sm text-muted-foreground">{pack.notes}</p> : null}
      {changes.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {changes.map((c, i) => (
            <li key={i} className="flex items-center gap-3 px-pad py-2">
              <DeltaChip kind={c.kind === "new" ? "new" : "changed"} />
              <span className="text-sm text-ink">{c.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default PackCard;
