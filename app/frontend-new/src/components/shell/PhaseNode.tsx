import * as React from "react";
import { Check, Circle, MinusCircle } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { RailPhase } from "./types";
import { useTranslation } from "react-i18next";

/**
 * PhaseNode (T025). One Define/Design/Build/Ship entry inside `Rail`'s
 * project mode. State comes from `RailPhase.state`
 * (base|todo|active|done|skipped), with an optional note line — see
 * contracts/design-system.md §2 Rail row and `shared/app.js` `track()`
 * for the reference states.
 */
const STATE_ICON: Record<RailPhase["state"], React.ReactNode> = {
  base: <Circle aria-hidden="true" className="h-3.5 w-3.5" />,
  todo: <Circle aria-hidden="true" className="h-3.5 w-3.5" />,
  active: <Circle aria-hidden="true" className="h-3.5 w-3.5 fill-current" />,
  done: <Check aria-hidden="true" className="h-3.5 w-3.5" />,
  skipped: <MinusCircle aria-hidden="true" className="h-3.5 w-3.5" />,
};

export interface PhaseNodeProps {
  phase: RailPhase;
  collapsed?: boolean;
}

export function PhaseNode({ phase, collapsed }: PhaseNodeProps) {
  const { t } = useTranslation();
  const state = t(`shell.phaseState.${phase.state}`);
  return (
    <NavLink
      to={phase.href}
      aria-label={
        phase.note
          ? t("shell.phaseAriaNote", { label: phase.label, state, note: phase.note })
          : t("shell.phaseAria", { label: phase.label, state })
      }
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-xs px-2.5 py-2 text-sm text-rail-muted hover:bg-rail-hover hover:text-rail-ink",
          (isActive || phase.state === "active") && "bg-rail-active text-rail-ink",
        )
      }
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          phase.state === "done" && "text-ok",
          phase.state === "skipped" && "text-muted-foreground",
          phase.state === "active" && "text-primary",
        )}
      >
        {STATE_ICON[phase.state]}
      </span>
      {!collapsed && (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{phase.label}</span>
          {phase.note ? <span className="truncate text-xs text-rail-muted">{phase.note}</span> : null}
        </span>
      )}
    </NavLink>
  );
}

export default PhaseNode;
