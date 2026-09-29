import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionScopeContext } from "@/features/versions/scope/context";
import Requirements from "../Requirements";
import Chat from "../Chat";

/**
 * P4 (NV-06): the smaller phase tools (Requirements, Chat) on a released
 * version. Writes are swallowed and the composer is inert; the same UI stays
 * live when readOnly is false or there is no VersionScope at all.
 */

const reqWrites = vi.hoisted(() => ({ addRequirement: vi.fn().mockResolvedValue(undefined), updateRequirement: vi.fn(), deleteRequirement: vi.fn() }));
const chatWrites = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
  cloneSession: vi.fn(),
  addMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));
const stable = vi.hoisted(() => ({
  reqs: { requirements: [] as unknown[], isLoading: false, refresh: () => {} },
  sessions: { sessions: [{ id: "s1", title: "Design chat", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ai_title: null, ai_summary: null }] },
  messages: { messages: [] as unknown[], updateStreamingMessage: () => {}, addTemporaryMessage: () => {}, saveAssistantMessage: () => {} },
  share: { token: null, isTokenSet: true, tokenMissing: false },
  auth: { user: { id: "u" }, loading: false },
  artifacts: { addArtifact: () => {} },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => stable.auth }));
vi.mock("@/hooks/useShareToken", () => ({ useShareToken: () => stable.share }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/hooks/useRealtimeRequirements", () => ({ useRealtimeRequirements: () => ({ ...stable.reqs, ...reqWrites }) }));
vi.mock("@/hooks/useRealtimeChatSessions", () => ({
  useRealtimeChatSessions: () => ({ ...stable.sessions, ...chatWrites }),
  useRealtimeChatMessages: () => ({ ...stable.messages, ...chatWrites }),
}));
vi.mock("@/hooks/useRealtimeArtifacts", () => ({ useRealtimeArtifacts: () => stable.artifacts }));
vi.mock("@/integrations/pronghorn-api/client", () => ({ pronghornApi: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }), functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/apiClient", () => ({ getAccessToken: vi.fn(), default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/components/requirements/RequirementsTree", () => ({ RequirementsTree: () => null }));
vi.mock("@/components/requirements/AIDecomposeDialog", () => ({ AIDecomposeDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="ai-dialog" /> : null) }));
vi.mock("@/components/requirements/LinkStandardsDialog", () => ({ LinkStandardsDialog: () => null }));
vi.mock("@/components/project/ProjectSelector", () => ({ ProjectSelector: () => null }));

function mount(ui: React.ReactNode, readOnly: boolean | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/p/proj/v/v1/x"]}>
        <Routes>
          <Route path="/p/:projectId/*" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    readOnly === undefined ? page : <VersionScopeContext.Provider value={{ readOnly, version: null }}>{page}</VersionScopeContext.Provider>,
  );
}

beforeEach(() => {
  Object.values(reqWrites).forEach((f) => f.mockClear());
  Object.values(chatWrites).forEach((f) => f.mockClear());
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

describe("Requirements (P4)", () => {
  it("read-only: adding an epic writes nothing and AI Decompose does not open", () => {
    mount(<Requirements />, true);
    fireEvent.click(screen.getByText("Add First Epic"));
    fireEvent.click(screen.getByText("AI Decompose"));
    expect(reqWrites.addRequirement).not.toHaveBeenCalled();
    expect(screen.queryByTestId("ai-dialog")).toBeNull();
  });

  it.each([false, undefined])("editable (readOnly %s): the same controls work", (readOnly) => {
    mount(<Requirements />, readOnly);
    fireEvent.click(screen.getByText("Add First Epic"));
    fireEvent.click(screen.getByText("AI Decompose"));
    expect(reqWrites.addRequirement).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("ai-dialog")).toBeInTheDocument();
  });
});

describe("Chat (P4)", () => {
  const composer = () => screen.getByPlaceholderText("Type your message... (Shift+Enter for new line)") as HTMLTextAreaElement;

  it("read-only: a session can be opened but the composer is disabled and New Chat writes nothing", () => {
    mount(<Chat />, true);
    fireEvent.click(screen.getByText("New Chat"));
    fireEvent.click(screen.getByText("Design chat"));
    expect(composer()).toBeDisabled();
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(chatWrites.createSession).not.toHaveBeenCalled();
    expect(chatWrites.addMessage).not.toHaveBeenCalled();
  });

  it.each([false, undefined])("editable (readOnly %s): the composer is enabled and New Chat creates a session", (readOnly) => {
    mount(<Chat />, readOnly);
    fireEvent.click(screen.getByText("New Chat"));
    expect(chatWrites.createSession).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Design chat"));
    expect(composer()).toBeEnabled();
  });
});
