import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * EmptyState (T023). Centered placeholder for an empty list/section, with an
 * optional action. Reference: `shared/base.css` `.empty` / `.empty.small` /
 * `.empty-cta`.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  cta?: React.ReactNode;
  /** Compact padding for use inside a smaller card/section. */
  size?: "default" | "small";
}

export function EmptyState({ title, description, cta, size = "default", className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-1.5 text-center text-muted-foreground",
        size === "small" ? "p-4" : "p-9 px-6",
        className,
      )}
      {...props}
    >
      <b className="text-base font-semibold text-ink">{title}</b>
      {description ? <span>{description}</span> : null}
      {cta ? <div className="mt-2.5 grid justify-items-center gap-2.5">{cta}</div> : null}
    </div>
  );
}

export default EmptyState;
