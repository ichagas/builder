import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { VersionScopeContext } from "@/features/versions/scope/context";
import Deploy from "../Deploy";

/** P4 (NV-06): Deploy cannot open the create-deployment dialog on a released version. */

const stable = vi.hoisted(() => ({
  deployments: { deployments: [], isLoading: false, isRefreshing: false, refresh: () => {}, broadcastRefresh: () => {} },
  share: { token: null, isTokenSet: true, tokenMissing: false },
  admin: { isSuperAdmin: false },
}));

vi.mock("@/hooks/useShareToken", () => ({ useShareToken: () => stable.share }));
vi.mock("@/contexts/AdminContext", () => ({ useAdmin: () => stable.admin }));
vi.mock("@/hooks/useRealtimeDeployments", () => ({ useRealtimeDeployments: () => stable.deployments }));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/deploy/DeploymentDialog", () => ({ default: ({ open }: { open: boolean }) => (open ? <div data-testid="create-dialog" /> : null) }));
vi.mock("@/components/deploy/DeploymentCard", () => ({ default: () => null }));
vi.mock("@/components/deploy/TestingLogsViewer", () => ({ default: () => null }));
vi.mock("@/components/superadmin/SuperadminCloudManager", () => ({ SuperadminCloudManager: () => null }));

function mount(readOnly: boolean | undefined) {
  const page = (
    <MemoryRouter initialEntries={["/p/proj/v/v1/build/deploy"]}>
      <Routes>
        <Route path="/p/:projectId/*" element={<Deploy />} />
      </Routes>
    </MemoryRouter>
  );
  return render(readOnly === undefined ? page : <VersionScopeContext.Provider value={{ readOnly, version: null }}>{page}</VersionScopeContext.Provider>);
}

describe("Deploy (P4)", () => {
  it("read-only: Create First Deployment does not open the dialog", () => {
    mount(true);
    fireEvent.click(screen.getByText("Create First Deployment"));
    expect(screen.queryByTestId("create-dialog")).toBeNull();
  });

  it.each([false, undefined])("editable (readOnly %s): it opens", (readOnly) => {
    mount(readOnly);
    fireEvent.click(screen.getByText("Create First Deployment"));
    expect(screen.getByTestId("create-dialog")).toBeInTheDocument();
  });
});
