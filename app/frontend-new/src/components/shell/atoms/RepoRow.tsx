import * as React from "react";
import { cn } from "@/lib/utils";
import { MeshDots, type MeshAgentId, type MeshAgentStatus } from "./MeshDots";
import { PrChip, type PrChipState } from "./PrChip";
import { StackBadge, type StackProfile } from "./StackBadge";

/**
 * RepoRow (T023). One repository line in the Assurance console's
 * Applications view: name + sync note, stack, findings, mesh verdict and PR
 * state. Reference: `shared/onboarding.css` `.repo-row` (lines 87-91:
 * `@media (max-width: 900px)` collapses to 2 columns, with the findings and
 * mesh cells each spanning the full row), `shared/onboard-b.js` `repoRow()`.
 */
export interface RepoRowProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  /** e.g. "Payments · Standards 2026.2 · behind" */
  note?: string;
  stack: { profile: StackProfile; label: string };
  /** e.g. "baseline 4 · new 1" */
  findings?: string;
  mesh: Partial<Record<MeshAgentId, MeshAgentStatus>>;
  pr?: { number: number; state: PrChipState } | { state: "none"; label: string };
}

export function RepoRow({ name, note, stack, findings, mesh, pr, className, ...props }: RepoRowProps) {
  return (
    <div
      className={cn(
        "grid min-h-[58px] items-center gap-gap px-pad py-[10px]",
        "grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_auto_minmax(120px,auto)_auto]",
        "max-[900px]:grid-cols-[minmax(0,1fr)_auto]",
        className,
      )}
      {...props}
    >
      <span>
        <code className="font-mono text-[13px] font-semibold text-ink">{name}</code>
        {note ? <span className="block text-[12.5px] text-muted">{note}</span> : null}
      </span>
      <StackBadge profile={stack.profile} label={stack.label} />
      {findings ? (
        <span className="text-[12.5px] text-muted max-[900px]:col-span-full">{findings}</span>
      ) : (
        <span className="max-[900px]:col-span-full" />
      )}
      <MeshDots statuses={mesh} className="max-[900px]:col-span-full" />
      {pr && "number" in pr ? (
        <PrChip number={pr.number} state={pr.state} />
      ) : (
        <PrChip state="none">{pr && "label" in pr ? pr.label : "Not opened"}</PrChip>
      )}
    </div>
  );
}

export default RepoRow;
