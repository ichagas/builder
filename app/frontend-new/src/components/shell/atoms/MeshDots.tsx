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
  none: "border border-dashed border-line-2 bg-surface-2 text-muted",
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
              "grid h-[22px] w-[22px] place-items-center rounded-s font-mono text-[11px] font-bold text-primary-foreground",
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
