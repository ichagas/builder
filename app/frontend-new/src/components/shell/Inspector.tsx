import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Inspector (T028). See contracts/design-system.md §2: "Right panel on
 * desktop, bottom sheet with detents (peek, half, full) at <=768px."
 *
 * Desktop: a fixed-width side panel. Mobile: a bottom sheet whose height
 * follows the current detent, cycled with the header's chevron button (a
 * simple, fully keyboard-operable alternative to drag-to-resize).
 */
export type InspectorDetent = "peek" | "half" | "full";

const DETENT_HEIGHT: Record<InspectorDetent, string> = {
  peek: "h-[22vh]",
  half: "h-[50vh]",
  full: "h-[92vh]",
};

const NEXT_DETENT: Record<InspectorDetent, InspectorDetent> = {
  peek: "half",
  half: "full",
  full: "peek",
};

export interface InspectorProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  detent?: InspectorDetent;
  onDetentChange?: (detent: InspectorDetent) => void;
  className?: string;
}

export function Inspector({ title, onClose, children, detent = "half", onDetentChange, className }: InspectorProps) {
  const { t } = useTranslation();
  return (
    <>
      {/* Desktop: right side panel */}
      <aside
        aria-label={title}
        className={cn("hidden w-80 shrink-0 flex-col border-l border-line bg-surface md:flex", className)}
      >
        <InspectorHeader title={title} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </aside>

      {/* Mobile: bottom sheet with detents */}
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-md border-t border-line bg-surface shadow-xl transition-[height] md:hidden",
          DETENT_HEIGHT[detent],
        )}
      >
        <InspectorHeader
          title={title}
          onClose={onClose}
          detentButton={
            <button
              type="button"
              onClick={() => onDetentChange?.(NEXT_DETENT[detent])}
              aria-label={t("shell.inspector.resize", { detent })}
              className="flex h-8 w-8 items-center justify-center rounded-xs text-muted-foreground"
            >
              <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", detent === "full" && "rotate-180")} />
            </button>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </>
  );
}

function InspectorHeader({ title, onClose, detentButton }: { title: string; onClose: () => void; detentButton?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between border-b border-line px-3 py-2">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="flex items-center gap-1">
        {detentButton}
        <button type="button" onClick={onClose} aria-label={t("shell.inspector.close")} className="flex h-8 w-8 items-center justify-center rounded-xs text-muted-foreground">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default Inspector;
