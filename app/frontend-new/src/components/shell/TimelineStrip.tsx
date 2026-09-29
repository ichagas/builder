import * as React from "react";
import { Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { handleTablistKeyDown } from "@/lib/a11y/rovingTabs";
import { useBoolPref } from "@/lib/state/useUiPrefs";
import type { TimelineFlag, TimelineNode } from "./types";

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

const KIND_WITH_TEXT = new Set<TimelineNode["kind"]>(["current", "building", "hotfix", "planned"]);

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

  // Roving tabindex (T160): one tab stop for the whole strip (the selected
  // version, or the first when the selection is outside the visible nodes);
  // Left/Right/Home/End move focus between versions, Enter/Space (native
  // button) opens the focused one.
  const tabNodes = displayNodes.filter((n) => n.kind !== "more");
  const tabStopId = tabNodes.some((n) => n.id === selectedId) ? selectedId : tabNodes[0]?.id;

  return (
    <div
      role="tablist"
      aria-label={t("a11y.timeline.label")}
      aria-describedby="timeline-hint"
      onKeyDown={handleTablistKeyDown}
      className={cn(
        "flex items-stretch gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <span id="timeline-hint" className="sr-only">
        {t("a11y.timeline.hint")}
      </span>
      {displayNodes.map((node) => {
        if (node.kind === "more") {
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => setExpanded(true)}
              title={node.sub}
              className="flex min-h-11 shrink-0 flex-col items-center justify-center rounded-xs px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface-2"
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
              tabIndex={node.id === tabStopId ? 0 : -1}
              onClick={() => onSelect(node.id)}
              className={cn(
                "flex min-h-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xs px-2.5 py-1 text-xs",
                isSelected ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-surface-2",
              )}
            >
              <span className="flex items-center gap-1 font-mono font-semibold">
                {node.verdict ? <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", VERDICT_DOT[node.verdict])} /> : null}
                {node.label}
              </span>
              {node.sub ? <span>{node.sub}</span> : null}
              {KIND_WITH_TEXT.has(node.kind) ? <span className="sr-only">{t(`a11y.timeline.kind.${node.kind}`)}</span> : null}
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
                <span className="sr-only">{t(flag.pending ? "a11y.timeline.flagPending" : "a11y.timeline.flagDone", { label: flag.label })}</span>
                <span aria-hidden="true">{flag.label}</span>
              </span>
            ))}
          </React.Fragment>
        );
      })}
      {expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="min-h-11 shrink-0 rounded-xs px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface-2"
        >
          Fewer
        </button>
      ) : null}
    </div>
  );
}

export default TimelineStrip;
