import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionScopeContext } from "@/features/versions/scope/context";
import { gateOpener, readOnlyWrite } from "@/features/versions/scope/readOnly";
import Artifacts from "../Artifacts";

/** P4 (NV-06): Artifacts on a released version. Writes, editing, dialogs and collaboration cannot start. */

const writes = vi.hoisted(() => ({
  addArtifact: vi.fn(),
  addFolder: vi.fn(),
  moveArtifact: vi.fn(),
  renameFolder: vi.fn(),
  updateArtifact: vi.fn(),
  deleteArtifact: vi.fn(),
  deleteFolder: vi.fn(),
}));
const artifact = vi.hoisted(() => ({
  id: "a1",
  ai_title: "Spec notes",
  ai_summary: null,
  content: "hello",
  image_url: null,
  is_folder: false,
  parent_id: null,
  created_at: "2026-01-01T00:00:00Z",
  source_type: null,
  source_id: null,
  provenance_id: null,
  children: [],
}));
const hookValue = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" }, loading: false }) }));
vi.mock("@/hooks/useShareToken", () => ({ useShareToken: () => ({ token: null, isTokenSet: true, tokenMissing: false }) }));
vi.mock("@/hooks/useRealtimeArtifacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useRealtimeArtifacts")>()),
  useRealtimeArtifacts: () => hookValue.current,
}));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/lib/apiClient", () => ({ default: { get: vi.fn().mockResolvedValue({ content: "hello" }) }, getAccessToken: vi.fn() }));
vi.mock("@/integrations/pronghorn-api/client", () => ({ pronghornApi: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }), functions: { invoke: vi.fn() } } }));
vi.mock("@/components/collaboration/ArtifactCollaborator", () => ({ ArtifactCollaborator: () => <div data-testid="collaborator" /> }));
vi.mock("@/components/artifacts/ArtifactFolderSidebar", () => ({ ArtifactFolderSidebar: () => null }));

hookValue.current = {
  artifacts: [artifact],
  artifactTree: [artifact],
  isLoading: false,
  ...writes,
  refresh: vi.fn(),
  broadcastRefresh: vi.fn(),
};

function renderPage(readOnly: boolean | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/p/proj/v/v1/define/artifacts"]}>
        <Routes>
          <Route path="/p/:projectId/*" element={<Artifacts />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    readOnly === undefined ? page : <VersionScopeContext.Provider value={{ readOnly, version: null }}>{page}</VersionScopeContext.Provider>,
  );
}

const iconButton = (container: HTMLElement, icon: string) => container.querySelector(`svg.lucide-${icon}`)?.closest("button") as HTMLButtonElement;

describe("readOnlyWrite / gateOpener", () => {
  it("pass the function through untouched when editable", () => {
    const fn = vi.fn();
    expect(readOnlyWrite(false, fn)).toBe(fn);
    expect(gateOpener(false, fn)).toBe(fn);
  });

  it("swallow writes and openers when read-only, but let closers through", async () => {
    const write = vi.fn();
    await readOnlyWrite(true, write)("x");
    expect(write).not.toHaveBeenCalled();
    const set = vi.fn();
    gateOpener(true, set)(true);
    expect(set).not.toHaveBeenCalled();
    gateOpener<unknown>(true, set)(null);
    expect(set).toHaveBeenCalledWith(null);
  });
});

describe("Artifacts page (P4)", () => {
  beforeEach(() => Object.values(writes).forEach((f) => f.mockReset()));

  it("read-only: collaborate, edit, delete and clone do nothing", async () => {
    const { container } = renderPage(true);
    fireEvent.click(iconButton(container, "users"));
    fireEvent.click(iconButton(container, "pen"));
    fireEvent.click(iconButton(container, "trash2"));
    fireEvent.click(iconButton(container, "copy"));
    await Promise.resolve();
    expect(screen.queryByTestId("collaborator")).toBeNull();
    expect(screen.queryByText("Edit Artifact")).toBeNull();
    expect(screen.queryByText("Delete Artifact", { selector: "h2" })).toBeNull();
    expect(writes.addArtifact).not.toHaveBeenCalled();
  });

  it.each([false, undefined])("editable (readOnly %s): the same buttons open collaboration and the delete dialog", async (readOnly) => {
    const { container } = renderPage(readOnly);
    fireEvent.click(iconButton(container, "trash2"));
    expect(await screen.findByText("Delete Artifact", { selector: "h2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(iconButton(container, "users"));
    expect(await screen.findByTestId("collaborator")).toBeInTheDocument();
  });
});
