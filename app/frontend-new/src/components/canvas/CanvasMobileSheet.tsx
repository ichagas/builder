import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CanvasMobileSheet (T046, WP-G1). A phone-only (<768px) bottom sheet for
 * Canvas's palette and node/edge properties panel -- see tasks.md T046
 * ("Palettes and properties panels become an Inspector/Sheet on phones").
 *
 * This intentionally isn't the shared `components/shell/Inspector`: that
 * component always renders its title *and* children twice at once (a
 * hidden desktop `<aside>` plus the mobile sheet, switched by CSS media
 * queries only -- see its own test, "renders the panel title and
 * content, twice"). That's fine for read-only/decorative content, but
 * Canvas's palette and properties panels are stateful forms with element
 * ids (`node-label`, etc.) and side-effecting handlers -- mounting two
 * independent instances of them at once would duplicate ids (an
 * accessibility bug) and let two separate copies of the same form drift
 * out of sync. This local component renders its content exactly once,
 * only for phones (Canvas.tsx already gates it with `isMobile`), matching
 * Inspector's mobile visual (bottom sheet, rounded top, detent cycling)
 * without the double-mount. Shared shell code is off-limits to edit per
 * the restyle recipe, so this stays local to Canvas (components used only
 * by this page).
 */
export type CanvasSheetDetent = "peek" | "half" | "full";

const DETENT_HEIGHT: Record<CanvasSheetDetent, string> = {
  peek: "h-[22vh]",
  half: "h-[50vh]",
  full: "h-[92vh]",
};

const NEXT_DETENT: Record<CanvasSheetDetent, CanvasSheetDetent> = {
  peek: "half",
  half: "full",
  full: "peek",
};

export interface CanvasMobileSheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  detent?: CanvasSheetDetent;
  onDetentChange?: (detent: CanvasSheetDetent) => void;
  className?: string;
}

export function CanvasMobileSheet({ title, onClose, children, detent = "half", onDetentChange, className }: CanvasMobileSheetProps) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-md border-t border-border bg-card shadow-xl transition-[height] md:hidden",
        DETENT_HEIGHT[detent],
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2 flex-shrink-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDetentChange?.(NEXT_DETENT[detent])}
            aria-label={`Resize panel (currently ${detent})`}
            className="h-8 w-8"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", detent === "full" && "rotate-180")} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

export default CanvasMobileSheet;
