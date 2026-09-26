import * as React from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ModeBadge } from "./ModeBadge";
import type { ModeBadgeInfo, ModeKind } from "./types";

/**
 * GlobalBar (T024). See contracts/design-system.md §2:
 * "Logo, ProjectSwitcher (project layout) or TeamSwitcher (assurance
 * layout, the only team control), ModeBadge, search (⌘K), StatusPill,
 * account menu. 3px mode band."
 *
 * `switcher` and `statusPill`/`accountMenu` are slots so this component
 * doesn't need to know about project/team data, `useLongTask`, or auth —
 * the layouts (`ProjectLayout`, `AssuranceLayout`, ...) wire those in.
 */
const BAND_CLASS: Record<ModeKind, string> = {
  building: "bg-mode-building",
  released: "bg-mode-released",
  connected: "bg-mode-connected",
  standards: "bg-line",
};

export interface GlobalBarProps {
  /** ProjectSwitcher or TeamSwitcher, depending on the layout. */
  switcher?: React.ReactNode;
  mode?: ModeBadgeInfo;
  onSearch: () => void;
  statusPill?: React.ReactNode;
  accountMenu?: React.ReactNode;
  logoHref?: string;
  className?: string;
}

export function GlobalBar({ switcher, mode, onSearch, statusPill, accountMenu, logoHref = "/projects", className }: GlobalBarProps) {
  const { t } = useTranslation();
  return (
    <header
      className={cn("relative flex h-14 shrink-0 items-center gap-3 border-b border-gbar-line bg-gbar px-3 text-gbar-ink", className)}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-[3px]", mode ? BAND_CLASS[mode.kind] : "bg-transparent")} />
      <a href={logoHref} className="flex shrink-0 items-center gap-2 font-semibold" aria-label="Pronghorn home">
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-xs bg-primary text-sm font-bold text-primary-foreground">
          P
        </span>
        <span className="hidden sm:inline">Pronghorn</span>
      </a>
      {switcher}
      {mode ? <ModeBadge {...mode} className="hidden md:inline-flex" /> : null}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onSearch}
        className="hidden h-8 min-w-56 items-center gap-2 rounded-xs border border-line bg-surface px-2.5 text-sm text-muted sm:flex"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        <span className="flex-1 text-left">{t("shell.search.placeholder")}</span>
        <kbd className="rounded-xs border border-line bg-surface-2 px-1 font-mono text-[11px]">{t("shell.search.shortcut")}</kbd>
      </button>
      <button
        type="button"
        onClick={onSearch}
        aria-label={t("shell.search.ariaLabel")}
        className="flex h-8 w-8 items-center justify-center rounded-xs sm:hidden"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
      </button>
      {statusPill}
      {accountMenu}
    </header>
  );
}

export default GlobalBar;
