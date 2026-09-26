import * as React from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * VersionTag (T023). Mono badge naming a version ("v1.0.0", "v1.1.0-rc").
 * Reference: `shared/base.css` `.ver`, `shared/blueprint.css`
 * (`.ver { color: var(--primary) }`), used throughout `versions.js` for the
 * timeline, release lanes and history rows.
 */
export interface VersionTagProps extends React.HTMLAttributes<HTMLSpanElement> {
  version: string;
  /** Released/locked baseline — shows a lock glyph (see versions.js `.lk`). */
  locked?: boolean;
}

export function VersionTag({ version, locked, className, ...props }: VersionTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-s border border-line bg-surface-2 px-2 py-[3px] font-mono text-[13px] font-semibold text-primary",
        className,
      )}
      {...props}
    >
      {version}
      {locked ? <Lock aria-label="Locked" className="h-3.5 w-3.5" /> : null}
    </span>
  );
}

export default VersionTag;
