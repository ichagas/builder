import { useTranslation } from "react-i18next";
import { Disclosure } from "@/components/shell/Disclosure";
import { cn } from "@/lib/utils";
import type { CanvasEdgeLite, CanvasNodeLite } from "../change.api";
import { nodeLabel, scopeNodes } from "./steps";

/**
 * Scoped canvas (NV-03 Design step). Not the full editor: the change's
 * affected components (`work_items.components`, canvas node ids) are
 * highlighted with what they connect to, and everything else stays
 * collapsed ("Everything else stays as released").
 */
export function ScopedCanvas({
  nodes,
  edges,
  affectedIds,
  versionLabel,
}: {
  nodes: CanvasNodeLite[];
  edges: CanvasEdgeLite[];
  affectedIds: string[];
  versionLabel?: string;
}) {
  const { t } = useTranslation();
  const { affected, others } = scopeNodes(nodes, affectedIds);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const neighbours = (id: string): string[] =>
    edges
      .filter((e) => e.source === id || e.target === id)
      .map((e) => byId.get(e.source === id ? e.target : e.source))
      .filter((n): n is CanvasNodeLite => !!n)
      .map(nodeLabel);

  return (
    <section className="rounded-xs border border-line bg-surface" aria-labelledby="change-canvas">
      <div className="flex items-center justify-between gap-2 border-b border-line px-pad py-2.5">
        <h2 id="change-canvas" className="text-sm font-semibold text-ink">
          {t("versions.change.canvas.heading")}
        </h2>
        <span className="text-xs text-muted-foreground">{t("versions.change.canvas.affected", { count: affected.length })}</span>
      </div>
      {affected.length === 0 ? (
        <p className="p-pad text-sm text-muted-foreground">{t("versions.change.canvas.none")}</p>
      ) : (
        <ul className="grid gap-2 p-pad sm:grid-cols-2" data-testid="scoped-canvas-affected">
          {affected.map((node) => {
            const links = neighbours(node.id);
            return (
              <li key={node.id} className={cn("rounded-xs border border-primary bg-primary-soft px-3 py-2")}>
                <b className="text-ink">{nodeLabel(node)}</b>
                <span className="block text-xs text-muted-foreground">
                  {links.length ? t("versions.change.canvas.connects", { list: links.join(", ") }) : t("versions.change.canvas.noLinks")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {others.length > 0 ? (
        <div className="px-pad pb-pad">
          <Disclosure prefKey="versions.change.canvas.others" summary={t("versions.change.canvas.others", { count: others.length, version: versionLabel ?? "" })}>
            <ul className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {others.map((node) => (
                <li key={node.id} className="rounded-xs border border-line px-2 py-1">
                  {nodeLabel(node)}
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      ) : null}
    </section>
  );
}

export default ScopedCanvas;
