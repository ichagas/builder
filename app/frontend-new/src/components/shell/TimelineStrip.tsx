import * as React from "react";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBoolPref } from "@/lib/state/useUiPrefs";
import type { TimelineFlag, TimelineNode } from "./types";
import { useTranslation } from "react-i18next";

/**
 * TimelineStrip (T026). See contracts/design-system.md §2:
 * "Props: nodes, flags, selectedId, onSelect. Collapses history into 'N
 * more'. Keeps the selection in view. Horizontal scroll with no visible
 * scrollbar on mobile."
 *
 * Reference: docs/design/frontend-redesign/option-a-styles/shared/versions.js
 * `renderTimeline`/`tl-node`/`tl-flag`. Until B1 ships releases, callers
 * pass a single `kind: "building"` node (D-7).
 */
const VERDICT_DOT: Record<NonNullable<TimelineNode["verdict"]>, string> = {
  green: "bg-mesh-green",
  yellow: "bg-mesh-yellow",
  red: "bg-mesh-red",
  blue: "bg-mesh-blue",
};

export interface TimelineStripProps {
  nodes: TimelineNode[];
  flags?: TimelineFlag[];
  selectedId?: string;
  onSelect: (id: string) => void;
  /** How many trailing "hist" nodes stay visible before collapsing into "N more". */
  visibleHistoryCount?: number;
  className?: string;
}

export function TimelineStrip({ nodes, flags = [], selectedId, onSelect, visibleHistoryCount = 3, className }: TimelineStripProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useBoolPref("tl.expanded", false);
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    // jsdom (unit tests) doesn't implement scrollIntoView; guard the call.
    selectedRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [selectedId]);

  const displayNodes = React.useMemo(() => {
    if (expanded) return nodes;
    const histIndexes = nodes.reduce<number[]>((acc, n, i) => (n.kind === "hist" ? [...acc, i] : acc), []);
    if (histIndexes.length <= visibleHistoryCount) return nodes;
    const hideCount = histIndexes.length - visibleHistoryCount;
    const hiddenIndexes = new Set(histIndexes.slice(0, hideCount));
    const hidden = nodes.filter((_, i) => hiddenIndexes.has(i));
    const moreNode: TimelineNode = {
      id: "__more__",
      label: t("shell.timeline.more", { count: hidden.length }),
      sub: hidden.length ? `${hidden[0].label} – ${hidden[hidden.length - 1].label}` : undefined,
      kind: "more",
    };
    const out: TimelineNode[] = [];
    let inserted = false;
    nodes.forEach((n, i) => {
      if (hiddenIndexes.has(i)) {
        if (!inserted) {
          out.push(moreNode);
          inserted = true;
        }
        return;
      }
      out.push(n);
    });
    return out;
  }, [nodes, expanded, visibleHistoryCount, t]);

  const flagsByAfterId = React.useMemo(() => {
    const map = new Map<string, TimelineFlag[]>();
    flags.forEach((f) => map.set(f.afterId, [...(map.get(f.afterId) ?? []), f]));
    return map;
  }, [flags]);

  return (
    <div
      role="tablist"
      aria-label={t("shell.timeline.ariaLabel")}
      className={cn(
        "flex items-stretch gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {displayNodes.map((node) => {
        if (node.kind === "more") {
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => setExpanded(true)}
              title={node.sub}
              className="flex shrink-0 flex-col items-center justify-center rounded-xs px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface-2"
            >
              <span className="font-semibold">{node.label}</span>
              {node.sub ? <span>{node.sub}</span> : null}
            </button>
          );
        }
        const isSelected = node.id === selectedId;
        const nodeFlags = flagsByAfterId.get(node.id) ?? [];
        return (
          <React.Fragment key={node.id}>
            <button
              ref={isSelected ? selectedRef : undefined}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelect(node.id)}
              className={cn(
                "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xs px-2.5 py-1 text-xs",
                isSelected ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-surface-2",
              )}
            >
              <span className="flex items-center gap-1 font-mono font-semibold">
                {node.verdict ? <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", VERDICT_DOT[node.verdict])} /> : null}
                {node.label}
              </span>
              {node.sub ? <span>{node.sub}</span> : null}
            </button>
            {nodeFlags.map((flag) => (
              <span
                key={flag.label}
                className={cn(
                  "flex shrink-0 items-center gap-1 self-center rounded-xs border border-line px-2 py-1 text-xs",
                  flag.pending ? "text-muted-foreground" : "text-ok",
                )}
              >
                <Flag aria-hidden="true" className="h-3.5 w-3.5" />
                {flag.label}
              </span>
            ))}
          </React.Fragment>
        );
      })}
      {expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="shrink-0 rounded-xs px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface-2"
        >
          Fewer
        </button>
      ) : null}
    </div>
  );
}

export default TimelineStrip;
