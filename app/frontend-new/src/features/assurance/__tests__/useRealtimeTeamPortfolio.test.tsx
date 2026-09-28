import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRealtimeTeamPortfolio } from "../useRealtimeTeamPortfolio";

const { mockChannelOn, mockChannelSubscribe, mockRemoveChannel, mockChannel } = vi.hoisted(() => {
  const mockChannelOn = vi.fn();
  const mockChannelSubscribe = vi.fn();
  const mockRemoveChannel = vi.fn();
  const chan: Record<string, unknown> = {};
  chan.on = (...args: unknown[]) => {
    mockChannelOn(...args);
    return chan;
  };
  chan.subscribe = (...args: unknown[]) => {
    mockChannelSubscribe(...args);
    return chan;
  };
  return { mockChannelOn, mockChannelSubscribe, mockRemoveChannel, mockChannel: chan };
});

vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    channel: () => mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

// `../api` (imported by the hook for `assuranceKeys`) pulls in the real
// `@/lib/apiClient`, which throws at import time outside a configured MSAL
// env (see src/lib/msalConfig.ts) -- mock it away, same as the api.test.tsx
// and TeamPortfolio.test.tsx suites.
vi.mock("@/lib/apiClient", () => ({
  default: { get: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useRealtimeTeamPortfolio", () => {
  beforeEach(() => {
    mockChannelOn.mockReset();
    mockChannelSubscribe.mockReset();
    mockRemoveChannel.mockReset();
  });

  it("subscribes to the mesh/PR/app-added events on team-{teamId} and unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useRealtimeTeamPortfolio("t1"), { wrapper });

    const events = mockChannelOn.mock.calls.map((call) => (call[1] as { event: string }).event);
    expect(events).toEqual(["mesh_run_received", "pr_state_changed", "app_added"]);
    expect(mockChannelSubscribe).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("does nothing without a teamId", () => {
    renderHook(() => useRealtimeTeamPortfolio(undefined), { wrapper });
    expect(mockChannelOn).not.toHaveBeenCalled();
  });
});
