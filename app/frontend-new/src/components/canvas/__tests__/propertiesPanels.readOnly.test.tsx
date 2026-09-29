import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Edge, Node } from "reactflow";
import { NodePropertiesPanel } from "../NodePropertiesPanel";
import { EdgePropertiesPanel } from "../EdgePropertiesPanel";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" }, loading: false }) }));
vi.mock("@/contexts/AdminContext", () => ({ useAdmin: () => ({ isAdmin: false, isSuperAdmin: false, role: "user", loading: false }) }));
vi.mock("@/hooks/useShareToken", () => ({ useShareToken: () => ({ token: null, isTokenSet: true, tokenMissing: false }) }));
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }), rpc: vi.fn(), functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/apiClient", () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), delete: vi.fn() } }));

const node = { id: "n1", position: { x: 1, y: 2 }, data: { label: "API", type: "API_ENDPOINT" } } as Node;
const edge = { id: "e1", source: "a", target: "b", label: "calls" } as Edge;

describe("NodePropertiesPanel readOnly (P4)", () => {
  const base = { node, onClose: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), projectId: "p", isOpen: true, onToggle: vi.fn(), mobile: true };

  it("disables the fields and hides Delete on a released version", () => {
    render(<NodePropertiesPanel {...base} readOnly />);
    expect(screen.getByTestId("node-properties-fields")).toBeDisabled();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.queryByText("Delete Node")).toBeNull();
  });

  it("stays editable by default", () => {
    render(<NodePropertiesPanel {...base} />);
    expect(screen.getByTestId("node-properties-fields")).not.toBeDisabled();
    expect(screen.getByLabelText("Name")).toBeEnabled();
    expect(screen.getByText("Delete Node")).toBeEnabled();
  });
});

describe("EdgePropertiesPanel readOnly (P4)", () => {
  const base = { edge, onClose: vi.fn(), onUpdate: vi.fn(), onVisualUpdate: vi.fn(), onDelete: vi.fn(), isOpen: true, onToggle: vi.fn(), mobile: true };

  it("disables the fields and actions on a released version", () => {
    render(<EdgePropertiesPanel {...base} readOnly />);
    expect(screen.getByTestId("edge-properties-fields")).toBeDisabled();
    expect(screen.getByLabelText("Label")).toBeDisabled();
    expect(screen.getByText("Delete Edge").closest("button")).toBeDisabled();
  });

  it("stays editable by default", () => {
    render(<EdgePropertiesPanel {...base} />);
    expect(screen.getByLabelText("Label")).toBeEnabled();
    expect(screen.getByText("Delete Edge").closest("button")).toBeEnabled();
  });
});
