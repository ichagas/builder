/**
 * Canvas.tsx's <MiniMap nodeColor={...}> callback, extracted so it can be
 * unit tested without rendering the whole Canvas page (WP-F2b fix round 1).
 *
 * Node-type legend colors come from the categorical palette tokens
 * (contracts/design-system.md §1.2), not raw hex: react-flow renders the
 * returned string as the minimap SVG <rect>'s `fill` attribute, and modern
 * browsers resolve `var(--…)` there like any other CSS value, so the color
 * follows theme changes automatically with no getComputedStyle polling.
 */
const MINIMAP_NODE_COLORS: Record<string, string> = {
  COMPONENT: "var(--cat-2)",
  API: "var(--cat-4)",
  DATABASE: "var(--cat-6)",
  SERVICE: "var(--cat-8)",
};

export function getMiniMapNodeColor(nodeType: string | undefined): string {
  return (nodeType && MINIMAP_NODE_COLORS[nodeType]) || "var(--muted)";
}
