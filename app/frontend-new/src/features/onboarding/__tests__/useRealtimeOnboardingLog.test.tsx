import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRealtimeOnboardingLog } from "../useRealtimeOnboardingLog";
import { onboardingKeys } from "../api";

const { channelNames, handlers, mockRemoveChannel, mockChannel } = vi.hoisted(() => {
  const channelNames: string[] = [];
  const handlers: Record<string, (m: unknown) => void> = {};
  const mockRemoveChannel = vi.fn();
  const chan: Record<string, unknown> = {};
  chan.on = (_t: string, f: { event: string }, cb: (m: unknown) => void) => {
    handlers[f.event] = cb;
    return chan;
  };
  chan.subscribe = () => chan;
  return { channelNames, handlers, mockRemoveChannel, mockChannel: chan };
});

vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    channel: (name: string) => {
      channelNames.push(name);
      return mockChannel;
    },
    removeChannel: mockRemoveChannel,
  },
}));
vi.mock("@/lib/apiClient", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { wrapper, invalidate };
}

describe("useRealtimeOnboardingLog", () => {
  beforeEach(() => {
    channelNames.length = 0;
    mockRemoveChannel.mockReset();
  });

  it("collects log and step lines from onboarding-{runId}, and re-reads the run on done", () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useRealtimeOnboardingLog("run1", true), { wrapper });
    expect(channelNames).toEqual(["onboarding-run1"]);

    act(() => handlers.onboarding_progress({ payload: { type: "log", message: "cloning" } }));
    act(() => handlers.onboarding_progress({ payload: { type: "step", step: "detect" } }));
    act(() => handlers.onboarding_progress({ payload: { type: "bogus" } }));
    expect(result.current.map((l) => l.text)).toEqual(["cloning", "detect"]);

    act(() => handlers.onboarding_progress({ payload: { type: "done" } }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: onboardingKeys.run("run1") });
  });

  it("removes the channel on unmount and stays closed when disabled", () => {
    const { wrapper } = setup();
    const { unmount } = renderHook(() => useRealtimeOnboardingLog("run1", true), { wrapper });
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);

    channelNames.length = 0;
    renderHook(() => useRealtimeOnboardingLog("run1", false), { wrapper });
    renderHook(() => useRealtimeOnboardingLog(undefined, true), { wrapper });
    expect(channelNames).toEqual([]);
  });
});
