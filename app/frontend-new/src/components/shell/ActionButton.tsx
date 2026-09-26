import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ActionButton (T028). See contracts/design-system.md §2:
 * "idle -> pending (spinner + progress) -> done/failed. confirm?: string
 * enables two-step confirmation. undo?: () => void pushes to UndoBar."
 *
 * `pushUndo` is a caller-supplied sink (normally `useUndo().push`, T029) so
 * this component doesn't need to depend on the undo store directly — it
 * only knows how to call it after a successful action.
 */
export type ActionButtonStatus = "idle" | "pending" | "done" | "failed";

export interface ActionButtonProps {
  label: string;
  onAction: () => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  /** Confirmation copy. First click asks "confirm?", second click runs the action. */
  confirm?: string;
  /** 0-100. Omit for an indeterminate spinner while pending. */
  progress?: number;
  undo?: { text: string; onUndo: () => void };
  pushUndo?: (entry: { text: string; undo: () => void }) => void;
  tone?: "primary" | "danger" | "ghost";
  className?: string;
}

export function ActionButton({
  label,
  onAction,
  disabled,
  disabledReason,
  confirm,
  progress,
  undo,
  pushUndo,
  tone = "primary",
  className,
}: ActionButtonProps) {
  const [status, setStatus] = React.useState<ActionButtonStatus>("idle");
  const [awaitingConfirm, setAwaitingConfirm] = React.useState(false);

  const run = React.useCallback(async () => {
    setStatus("pending");
    try {
      await onAction();
      setStatus("done");
      if (undo && pushUndo) pushUndo({ text: undo.text, undo: undo.onUndo });
    } catch {
      setStatus("failed");
    }
  }, [onAction, undo, pushUndo]);

  const handleClick = () => {
    if (disabled || status === "pending") return;
    if (confirm && !awaitingConfirm) {
      setAwaitingConfirm(true);
      return;
    }
    setAwaitingConfirm(false);
    void run();
  };

  const text = awaitingConfirm ? confirm : status === "failed" ? `${label} failed — retry` : label;

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={() => setAwaitingConfirm(false)}
      disabled={disabled || status === "pending"}
      title={disabled ? disabledReason : undefined}
      aria-busy={status === "pending"}
      className={cn(
        "relative flex h-10 items-center justify-center gap-2 overflow-hidden rounded-xs px-4 text-sm font-semibold",
        tone === "danger" ? "bg-bad text-white" : tone === "ghost" ? "border border-line bg-surface text-ink" : "bg-primary text-primary-foreground",
        (disabled || status === "pending") && "cursor-not-allowed opacity-70",
        status === "failed" && "bg-bad text-white",
        className,
      )}
    >
      {status === "pending" && progress === undefined ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      <span>{text}</span>
      {status === "pending" && progress !== undefined ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-white/70"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      ) : null}
    </button>
  );
}

export default ActionButton;
