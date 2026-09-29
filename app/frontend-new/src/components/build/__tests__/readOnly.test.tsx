import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionScopeContext } from "@/features/versions/scope/context";
import { UnifiedAgentInterface } from "../UnifiedAgentInterface";
import { CommitHistory } from "../CommitHistory";

/** P4 (NV-06): the Build agent composer and commit history on a released version. */

const rpc = vi.hoisted(() => vi.fn());
const stable = vi.hoisted(() => ({
  messages: { messages: [], loading: false, hasMore: false, loadMore: () => {}, refetch: () => {} },
  operations: { operations: [], loading: false, hasMore: false, loadMore: () => {}, refetch: () => {} },
  agent: { sections: [], customToolDescriptions: {}, hasCustomConfig: false },
}));

vi.mock("@/hooks/useInfiniteAgentMessages", () => ({ useInfiniteAgentMessages: () => stable.messages }));
vi.mock("@/hooks/useInfiniteAgentOperations", () => ({ useInfiniteAgentOperations: () => stable.operations }));
vi.mock("@/hooks/useProjectAgent", () => ({ useProjectAgent: () => stable.agent }));
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: { rpc, functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/apiClient", () => ({ getAccessToken: vi.fn(), default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../RawLLMLogsViewer", () => ({ RawLLMLogsViewer: () => null }));
vi.mock("../AgentPromptEditor", () => ({ AgentPromptEditor: () => null }));
vi.mock("@/components/project/ProjectSelector", () => ({ ProjectSelector: () => null }));

function withScope(readOnly: boolean | undefined, ui: React.ReactNode) {
  return readOnly === undefined ? <>{ui}</> : <VersionScopeContext.Provider value={{ readOnly, version: null }}>{ui}</VersionScopeContext.Provider>;
}

function agent(onPrimaryActionChange: (a: unknown) => void) {
  return (
    <UnifiedAgentInterface
      projectId="p"
      repoId="r"
      shareToken={null}
      attachedFiles={[]}
      onRemoveFile={() => {}}
      autoCommit={false}
      onAutoCommitChange={() => {}}
      onPrimaryActionChange={onPrimaryActionChange}
    />
  );
}

describe("UnifiedAgentInterface (P4)", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [], error: null });
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });

  it("read-only: the composer is disabled, Enter never starts the agent, the header action is disabled", () => {
    const onPrimary = vi.fn();
    render(withScope(true, agent(onPrimary)));
    const box = screen.getByPlaceholderText("Describe the task for the agent...") as HTMLTextAreaElement;
    expect(box).toBeDisabled();
    fireEvent.change(box, { target: { value: "do it" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(fetch).not.toHaveBeenCalled();
    const last = onPrimary.mock.calls.filter((c) => c[0]).at(-1)?.[0] as { label: string; disabled?: boolean };
    expect(last.label).toBe("Run agent");
    expect(last.disabled).toBe(true);
  });

  it.each([false, undefined])("editable (readOnly %s): the composer accepts a task and the action enables", (readOnly) => {
    const onPrimary = vi.fn();
    render(withScope(readOnly, agent(onPrimary)));
    const box = screen.getByPlaceholderText("Describe the task for the agent...") as HTMLTextAreaElement;
    expect(box).toBeEnabled();
    fireEvent.change(box, { target: { value: "do it" } });
    const last = onPrimary.mock.calls.filter((c) => c[0]).at(-1)?.[0] as { disabled?: boolean };
    expect(last.disabled).toBe(false);
  });
});

describe("CommitHistory restore (P4)", () => {
  it("does not reset the repo on a released version", async () => {
    rpc.mockReset();
    rpc.mockImplementation((name: string) =>
      Promise.resolve({
        data:
          name === "get_project_repos_with_token"
            ? [{ id: "r", is_prime: true, organization: "o", repo: "x", branch: "main" }]
            : name === "get_commit_history_with_token"
              ? [{ id: "c1", commit_sha: "abc1234", commit_message: "m", committed_at: "2026-01-01T00:00:00Z", files_changed: 1 }]
              : [],
        error: null,
      }),
    );
    render(withScope(true, <CommitHistory projectId="p" shareToken={null} />));
    const restore = await screen.findAllByRole("button");
    restore.forEach((b) => fireEvent.click(b));
    expect(rpc.mock.calls.some((c) => c[0] === "reset_repo_files_with_token")).toBe(false);
  });
});
