import * as React from "react";
import { Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * NextStepBanner (T028). See contracts/design-system.md §2:
 * "title, body, cta?, tone: info|ok|warn|lock. One per page at most."
 * Reference: `shared/app.js` `banner()`.
 */
export type NextStepTone = "info" | "ok" | "warn" | "lock";

const TONE_CLASS: Record<NextStepTone, string> = {
  info: "border-primary/40 bg-primary-soft",
  ok: "border-ok/40 bg-ok-soft",
  warn: "border-warn/40 bg-warn-soft",
  lock: "border-line bg-surface-2",
};

export interface NextStepBannerProps {
  title: string;
  body: string;
  cta?: { label: string; onClick: () => void };
  tone?: NextStepTone;
  className?: string;
}

export function NextStepBanner({ title, body, cta, tone = "info", className }: NextStepBannerProps) {
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xs border p-3", TONE_CLASS[tone], className)}>
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-ink">
        {tone === "lock" ? <Lock className="h-[18px] w-[18px]" /> : <Sparkles className="h-[18px] w-[18px]" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">{title}</div>
        <div className="text-sm text-muted">{body}</div>
      </div>
      {cta ? (
        <button
          type="button"
          onClick={cta.onClick}
          className="shrink-0 rounded-xs bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
        >
          {cta.label}
        </button>
      ) : null}
    </div>
  );
}

export default NextStepBanner;
