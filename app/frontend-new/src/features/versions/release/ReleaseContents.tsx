import { useTranslation } from "react-i18next";
import { Disclosure } from "@/components/shell/Disclosure";
import { TypeChip, VersionTag } from "@/components/shell/atoms";
import type { WorkItem } from "../api";
import { carryOverVersionName, draftNotes } from "./logic";

/**
 * What a release contains (NV-05): drafted release notes for the shipped
 * changes, and the carry-over list -- unfinished changes that move to the
 * next version automatically (spec US4: "in-order release with carry-over").
 */
export function ReleaseContents({
  versionName,
  shipped,
  carry,
  firstRelease,
}: {
  versionName: string;
  shipped: WorkItem[];
  carry: WorkItem[];
  firstRelease: boolean;
}) {
  const { t } = useTranslation();
  const notes = draftNotes(shipped);
  return (
    <>
      <Disclosure prefKey={`versions.release.notes.${versionName}`} defaultOpen summary={<b className="text-ink">{t("versions.release.notes.heading")}</b>}>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("versions.release.notes.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm" data-testid="release-notes">
            {notes.map((n) => (
              <li key={n.id}>
                <b className="text-ink">{t(`versions.release.notes.${n.prefix}`)}</b> {n.title}
              </li>
            ))}
          </ul>
        )}
      </Disclosure>

      {!firstRelease ? (
        <section className="rounded-xs border border-line bg-surface" aria-labelledby="release-carry-heading" data-testid="release-carry">
          <div className="flex items-center justify-between gap-2 border-b border-line px-pad py-2.5">
            <h2 id="release-carry-heading" className="text-sm font-semibold text-ink">
              {t("versions.release.carry.heading")}
            </h2>
            {carry.length > 0 ? <VersionTag version={carryOverVersionName(versionName)} /> : null}
          </div>
          {carry.length === 0 ? (
            <p className="px-pad py-2.5 text-sm text-muted-foreground">{t("versions.release.carry.none")}</p>
          ) : (
            <>
              <p className="px-pad pt-2.5 text-sm text-muted-foreground">
                {t("versions.release.carry.body", { count: carry.length, version: carryOverVersionName(versionName) })}
              </p>
              <ul className="divide-y divide-line">
                {carry.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-pad py-2.5">
                    <TypeChip type={item.type} />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{item.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

export default ReleaseContents;
