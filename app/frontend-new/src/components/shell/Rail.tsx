import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useBoolPref } from "@/lib/state/useUiPrefs";
import { PhaseNode } from "./PhaseNode";
import type { RailPhase, RailSection } from "./types";

/**
 * Rail (T025). See contracts/design-system.md §2:
 * "Props: sections: RailSection[]. Project layout: 'All versions' + version
 * card + 4 PhaseNodes ... Assurance: Portfolio, Onboard, Applications list
 * (count + worst status dot), Organization. Collapsible (pref persisted).
 * Hidden ≤768px."
 *
 * `sections` covers both layouts' plain nav rows (a project's "All
 * versions" row, or assurance's Portfolio/Onboard/Applications/
 * Organization). `phases` and `versionCard` are project-layout-only slots,
 * left undefined for the assurance layout.
 */
const DOT_CLASS: Record<NonNullable<RailSection["statusDot"]>, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

export interface RailProps {
  sections: RailSection[];
  phases?: RailPhase[];
  versionCard?: React.ReactNode;
  ariaLabel?: string;
}

export function Rail({ sections, phases, versionCard, ariaLabel }: RailProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useBoolPref("rail.collapsed", false);

  return (
    <nav
      aria-label={ariaLabel ?? t("shell.nav.project")}
      className={cn(
        "hidden shrink-0 flex-col overflow-y-auto border-r border-rail-line bg-rail-bg text-rail-ink md:flex",
        collapsed ? "w-[76px]" : "w-[248px]",
      )}
    >
      <div className="flex items-center justify-end p-1.5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-pressed={collapsed}
          aria-label={collapsed ? t("shell.rail.expand") : t("shell.rail.collapse")}
          className="flex h-7 w-7 items-center justify-center rounded-xs text-rail-muted hover:bg-rail-hover hover:text-rail-ink"
        >
          <ChevronLeft aria-hidden="true" className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 px-1.5 pb-2">
        {sections.map((section) => (
          <a
            key={section.id}
            href={section.href}
            className="flex items-center gap-2 rounded-xs px-2.5 py-2 text-sm text-rail-muted hover:bg-rail-hover hover:text-rail-ink"
          >
            {section.statusDot ? (
              <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", DOT_CLASS[section.statusDot])} />
            ) : null}
            {!collapsed && <span className="min-w-0 flex-1 truncate">{section.label}</span>}
            {!collapsed && section.count !== undefined ? (
              <span className="text-xs text-rail-muted">{section.count}</span>
            ) : null}
          </a>
        ))}
      </div>

      {versionCard ? <div className="border-t border-rail-line px-2.5 py-2">{versionCard}</div> : null}

      {phases && phases.length > 0 ? (
        <div role="list" aria-label={t("shell.nav.phases")} className="flex flex-col gap-0.5 border-t border-rail-line px-1.5 py-2">
          {phases.map((phase) => (
            <div role="listitem" key={phase.id}>
              <PhaseNode phase={phase} collapsed={collapsed} />
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}

export default Rail;
