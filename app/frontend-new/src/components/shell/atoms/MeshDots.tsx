import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * MeshDots (T023). Four small squares — one per Assurance Mesh agent
 * (Green, Yellow, Red, Blue) — each showing its first letter and colored by
 * verdict. Reference: `shared/onboarding.css` `.mesh-dots` / `.md`,
 * `shared/onboard-data.js` `meshDots()` (labelled agents + aria-label).
 */
export type MeshAgentId = "green" | "yellow" | "red" | "blue";
export type MeshAgentStatus = "pass" | "warn" | "fail" | "skip" | "none";

const AGENTS: { id: MeshAgentId; letter: string; name: string }[] = [
  { id: "green", letter: "G", name: "Green" },
  { id: "yellow", letter: "Y", name: "Yellow" },
  { id: "red", letter: "R", name: "Red" },
  { id: "blue", letter: "B", name: "Blue" },
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

const STATUS_WORD: Record<MeshAgentStatus, string> = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail",
  skip: "Skipped",
  none: "Not run",
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
  const label = `Assurance Mesh: ${AGENTS.map(
    (a) => `${a.name} ${STATUS_WORD[statuses[a.id] ?? "none"]}`,
  ).join(", ")}`;

  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={label} {...props}>
      {AGENTS.map((a) => {
        const status = statuses[a.id] ?? "none";
        return (
          <span
            key={a.id}
            title={`${a.name}: ${STATUS_WORD[status]}`}
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
