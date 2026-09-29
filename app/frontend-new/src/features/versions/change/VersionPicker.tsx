import { useTranslation } from "react-i18next";
import type { Version } from "../api";

/** Version picker (NV-03): move the change between open versions. Released versions aren't offered. */
export function VersionPicker({
  itemKey,
  versions,
  value,
  disabled,
  onChange,
}: {
  itemKey: string;
  versions: Version[];
  value: string | null;
  disabled: boolean;
  onChange: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  const open = versions.filter((v) => v.kind !== "released");
  // The change's current version may be released (locked): keep it selectable-looking so the control shows the truth.
  const options = value && !open.some((v) => v.id === value) ? [...open, ...versions.filter((v) => v.id === value)] : open;

  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      {t("versions.change.picker.label")}
      <select
        aria-label={t("versions.change.picker.aria", { key: itemKey })}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="min-h-[44px] rounded-xs border border-line bg-surface px-2 font-mono text-sm font-semibold text-primary disabled:opacity-60"
      >
        {value === null ? <option value="">{t("versions.change.picker.unscheduled")}</option> : null}
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} · {t(`versions.change.picker.kind.${v.kind}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default VersionPicker;
