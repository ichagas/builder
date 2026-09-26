import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * StackBadge (T023). Small mono chip with a colored square marking a
 * repository's platform/profile. Reference: `shared/onboarding.css`
 * `.stack` / `.stack.p-dotnet|p-node|p-java|p-python`.
 */
export type StackProfile = "dotnet" | "node" | "java" | "python";

// Dot colors mirror the prototype's literal hex values 1:1 against the token
// palette (dotnet #7C3AED = --c-define, node #16A34A = --c-ship, java
// #D97706 = --c-build, python #2563EB = --m-blue), so the badge stays on
// tokens rather than introducing new raw colors.
const DOT_CLASSES: Record<StackProfile, string> = {
  dotnet: "bg-define",
  node: "bg-ship",
  java: "bg-build",
  python: "bg-mesh-blue",
};

export interface StackBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  profile: StackProfile;
  /** Display label, e.g. ".NET 8", "Node 20". */
  label: string;
}

export function StackBadge({ profile, label, className, ...props }: StackBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-s border border-line bg-surface-2 px-[7px] py-[3px] font-mono text-[11.5px] font-semibold text-ink",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-[1px]", DOT_CLASSES[profile])} />
      {label}
    </span>
  );
}

export default StackBadge;
