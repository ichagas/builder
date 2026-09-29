import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * MeshDots (T023). Four small squares — one per Assurance Mesh agent
 * (Green, Yellow, Red, Blue) — each showing its first letter and colored by
 * verdict. Reference: `shared/onboarding.css` `.mesh-dots` / `.md`,
 * `shared/onboard-data.js` `meshDots()` (labelled agents + aria-label).
 */
export type MeshAgentId = "green" | "yellow" | "red" | "blue";
export type MeshAgentStatus = "pass" | "warn" | "fail" | "skip" | "none";

const AGENTS: { id: MeshAgentId; letter: string }[] = [
  { id: "green", letter: "G" },
  { id: "yellow", letter: "Y" },
  { id: "red", letter: "R" },
  { id: "blue", letter: "B" },
];

const AGENT_BG: Record<MeshAgentId, string> = {
  green: "bg-mesh-green",
  yellow: "bg-mesh-yellow",
  red: "bg-mesh-red",
  blue: "bg-mesh-blue",
};

// Fix round 1, item 4: white (--primary-foreground in light theme) on the
// green/yellow mesh fills fails WCAG AA (3.30:1 / 2.94:1) — those fills are
// bright/mid-toned in light theme. Dark ink text passes there (5.11:1 /
// 5.73:1), and in dark theme (where --primary-foreground is itself a dark
// navy, already passing at 7.76:1 / 9.22:1 against the brighter dark-theme
// fills, while --ink flips to a *light* color that would fail), `dark:`
// keeps using --primary-foreground. Red/blue already clear AA with
// --primary-foreground in both themes, so they're unchanged.
const AGENT_TEXT: Record<MeshAgentId, string> = {
  green: "text-ink dark:text-primary-foreground",
  yellow: "text-ink dark:text-primary-foreground",
  red: "text-primary-foreground",
  blue: "text-primary-foreground",
};

// warn/fail get a ring in the corresponding status token; skip fades out;
// none renders as an empty dashed square instead of a filled agent color.
const STATUS_CLASSES: Record<MeshAgentStatus, string> = {
  pass: "",
  warn: "ring-2 ring-warn ring-offset-2 ring-offset-surface",
  fail: "ring-2 ring-bad ring-offset-2 ring-offset-surface",
  skip: "opacity-30",
  none: "border border-dashed border-line-2 bg-surface-2 text-muted-foreground",
};

export interface MeshDotsProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Verdict per agent. An agent left out renders as "none" (not run). */
  statuses: Partial<Record<MeshAgentId, MeshAgentStatus>>;
}

export function MeshDots({ statuses, className, ...props }: MeshDotsProps) {
  const { t } = useTranslation();
  const word = (status: MeshAgentStatus) => t(`a11y.mesh.status.${status}`);
  // T160: the whole group is ONE image with one label ("Assurance Mesh: Green
  // Pass, Yellow Warning, ..."). role="img" makes the children presentational,
  // so a screen reader reads the summary once instead of four unlabeled
  // letters, and aria-label is legal on it (it is not on a bare span).
  const summary = AGENTS.map((a) =>
    t("a11y.mesh.entry", { agent: t(`a11y.mesh.agent.${a.id}`), status: word(statuses[a.id] ?? "none") }),
  ).join(", ");
  const label = t("a11y.mesh.label", { summary });

  return (
    <span role="img" className={cn("inline-flex items-center gap-1", className)} aria-label={label} {...props}>
      {AGENTS.map((a) => {
        const status = statuses[a.id] ?? "none";
        return (
          <span
            key={a.id}
            aria-hidden="true"
            title={`${t(`a11y.mesh.agent.${a.id}`)}: ${word(status)}`}
            className={cn(
              "grid h-[22px] w-[22px] place-items-center rounded-xs font-mono text-[11px] font-bold",
              AGENT_TEXT[a.id],
              status === "none" ? "" : AGENT_BG[a.id],
              STATUS_CLASSES[status],
            )}
          >
            {a.letter}
          </span>
        );
      })}
    </span>
  );
}

export default MeshDots;
