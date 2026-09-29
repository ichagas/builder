import * as React from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * AdoptionBar (T023). Proportional segments showing how many repositories
 * are on the latest Standards pack vs. an older one. Reference:
 * `shared/onboarding.css` `.adopt-bar` / `.ab` / `.ab-latest` / `.ab-old`,
 * `shared/onboard-b.js` (role="img" + aria-label summary).
 */
export interface AdoptionSegment {
  /** Standards pack version, e.g. "2026.2". */
  version: string;
  /** Number of repositories on this version. */
  count: number;
  /** The current/latest pack renders in "ok" (green); older packs in "warn". */
  latest?: boolean;
}

export interface AdoptionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  segments: AdoptionSegment[];
}

export function AdoptionBar({ segments, className, ...props }: AdoptionBarProps) {
  const { t } = useTranslation();
  const onVersion = (s: AdoptionSegment) => t("shell.atoms.adoption.onVersion", { count: s.count, version: s.version });
  const label = segments.map(onVersion).join(", ");

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("my-[14px] flex h-[30px] gap-0.5 overflow-hidden rounded-xs", className)}
      {...props}
    >
      {segments.map((s) => (
        <span
          key={s.version}
          title={onVersion(s)}
          style={{ flex: s.count }}
          className={cn(
            "flex min-w-0 items-center overflow-hidden whitespace-nowrap px-[10px] font-mono text-xs font-semibold",
            s.latest ? "bg-ok text-primary-foreground" : "bg-warn-soft text-warn",
          )}
        >
          {s.version} · {s.count}
        </span>
      ))}
    </div>
  );
}

export default AdoptionBar;
