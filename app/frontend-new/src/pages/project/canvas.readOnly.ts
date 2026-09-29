/**
 * P4 (NV-06): React Flow interaction props for the Canvas page. On a released
 * version (`readOnly`) nodes cannot be dragged or connected; selection stays on
 * so the properties panel can be used to inspect a node or an edge. When
 * `readOnly` is false the props equal React Flow's defaults, i.e. the legacy
 * behaviour (including `v/current`).
 */
export function getCanvasFlowInteraction(readOnly: boolean) {
  return {
    nodesDraggable: !readOnly,
    nodesConnectable: !readOnly,
    elementsSelectable: true,
  } as const;
}
