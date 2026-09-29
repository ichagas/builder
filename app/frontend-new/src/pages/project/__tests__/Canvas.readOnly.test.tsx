import * as React from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionScopeContext } from "@/features/versions/scope/context";
import { getCanvasFlowInteraction } from "../canvas.readOnly";
import Canvas from "../Canvas";

/**
 * P4 (NV-06): Canvas on a released version. React Flow is stubbed so the
 * props the page hands it can be asserted (jsdom cannot lay out a real flow).
 */

const flowProps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const saveNode = vi.hoisted(() => vi.fn());
const stable = vi.hoisted(() => {
  const noop = () => {};
  return {
    canvas: {
      nodes: [{ id: "n1", type: "custom", position: { x: 0, y: 0 }, data: { type: "API", label: "A" }, selected: true }],
      edges: [],
      setNodes: noop,
      setEdges: noop,
      onNodesChange: noop,
      onEdgesChange: noop,
      saveNode: undefined as unknown,
      saveEdge: noop,
      loadCanvasData: noop,
    },
    layers: { layers: [], isLoading: false, saveLayer: noop, deleteLayer: noop },
    nodeTypes: { data: [], isLoading: false },
    share: { token: null, isTokenSet: true, tokenMissing: false },
  };
});
const panelProps = vi.hoisted(() => ({ node: {} as Record<string, unknown> }));

vi.mock("reactflow", () => ({
  default: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    flowProps.current = props;
    return <div data-testid="flow">{props.children as React.ReactNode}</div>;
  },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getNodesBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
}));
vi.mock("reactflow/dist/style.css", () => ({}));
vi.mock("@/hooks/useShareToken", () => ({ useShareToken: () => stable.share }));
vi.mock("@/hooks/useRealtimeCanvas", () => ({ useRealtimeCanvas: () => stable.canvas }));
vi.mock("@/hooks/useRealtimeLayers", () => ({ useRealtimeLayers: () => stable.layers }));
vi.mock("@/hooks/useNodeTypes", () => ({ useNodeTypes: () => stable.nodeTypes, groupByCategory: () => ({}) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/apiClient", () => ({ default: { delete: vi.fn(), post: vi.fn(), get: vi.fn() } }));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/canvas/CanvasPalette", () => ({ CanvasPalette: () => <div data-testid="palette" /> }));
vi.mock("@/components/canvas/AIArchitectDialog", () => ({ AIArchitectDialog: () => null }));
vi.mock("@/components/canvas/InfographicDialog", () => ({ InfographicDialog: () => null }));
vi.mock("@/components/canvas/EdgePropertiesPanel", () => ({ EdgePropertiesPanel: () => null }));
vi.mock("@/components/canvas/NodePropertiesPanel", () => ({
  NodePropertiesPanel: (props: Record<string, unknown>) => {
    panelProps.node = props;
    return <div data-testid="node-panel" />;
  },
}));

stable.canvas.saveNode = saveNode;

function renderCanvas(readOnly?: boolean) {
  const page = (
    <MemoryRouter initialEntries={["/p/proj-1/v/v1/design/canvas"]}>
      <Canvas />
    </MemoryRouter>
  );
  return render(
    readOnly === undefined ? (
      page
    ) : (
      <VersionScopeContext.Provider value={{ readOnly, version: null }}>{page}</VersionScopeContext.Provider>
    ),
  );
}

describe("getCanvasFlowInteraction", () => {
  it("locks dragging and connecting only when read-only, keeps selection", () => {
    expect(getCanvasFlowInteraction(true)).toEqual({ nodesDraggable: false, nodesConnectable: false, elementsSelectable: true });
    expect(getCanvasFlowInteraction(false)).toEqual({ nodesDraggable: true, nodesConnectable: true, elementsSelectable: true });
  });
});

describe("Canvas page (P4)", () => {
  beforeEach(() => {
    flowProps.current = {};
    panelProps.node = {};
    saveNode.mockClear();
  });

  it("read-only: React Flow is not draggable/connectable, drops and connects do nothing", () => {
    renderCanvas(true);
    expect(flowProps.current.nodesDraggable).toBe(false);
    expect(flowProps.current.nodesConnectable).toBe(false);
    expect(flowProps.current.elementsSelectable).toBe(true);
    expect(flowProps.current.deleteKeyCode).toBeNull();

    const preventDefault = vi.fn();
    (flowProps.current.onDragOver as (e: unknown) => void)({ preventDefault, dataTransfer: {} });
    expect(preventDefault).not.toHaveBeenCalled();
    (flowProps.current.onConnect as (c: unknown) => void)({ source: "a", target: "b" });
    expect(saveNode).not.toHaveBeenCalled();
  });

  it("read-only: toolbar generate/rewrite actions are disabled and the Delete shortcut is inert", () => {
    renderCanvas(true);
    const buttons = screen.getAllByRole("button");
    // The toolbar buttons have no text; the icon-only ones that mutate are the disabled ones.
    expect(buttons.filter((b) => (b as HTMLButtonElement).disabled).length).toBeGreaterThanOrEqual(4);
    const dragEvent = { preventDefault: vi.fn(), dataTransfer: { getData: () => "API" }, clientX: 0, clientY: 0 };
    void (flowProps.current.onDrop as (e: unknown) => Promise<void>)(dragEvent);
    expect(saveNode).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(saveNode).not.toHaveBeenCalled();
  });

  it("read-only: the node properties panel opens for inspection with readOnly", () => {
    renderCanvas(true);
    act(() => {
      (flowProps.current.onNodeClick as (e: unknown, n: unknown) => void)({}, { id: "n1", position: { x: 0, y: 0 }, data: {} });
    });
    expect(screen.getByTestId("node-panel")).toBeInTheDocument();
    expect(panelProps.node.readOnly).toBe(true);
  });

  it("editable: the node properties panel is not read-only", () => {
    renderCanvas(false);
    act(() => {
      (flowProps.current.onNodeClick as (e: unknown, n: unknown) => void)({}, { id: "n1", position: { x: 0, y: 0 }, data: {} });
    });
    expect(panelProps.node.readOnly).toBe(false);
  });

  it("editable (no version scope, and readOnly false): full interaction", () => {
    for (const readOnly of [undefined, false]) {
      renderCanvas(readOnly);
      expect(flowProps.current.nodesDraggable).toBe(true);
      expect(flowProps.current.nodesConnectable).toBe(true);
      expect(flowProps.current.elementsSelectable).toBe(true);
    }
  });
});
