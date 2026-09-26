/**
 * Unit tests for onboarding realtime broadcasts (spec 007, fix round 2,
 * item 6).
 */
jest.mock("../../../websocket", () => ({
  broadcast: jest.fn(),
}));

import { broadcast } from "../../../websocket";
import { onboardingChannel, broadcastOnboardingProgress } from "../../../services/onboarding/realtime";

const mockBroadcast = broadcast as jest.Mock;

describe("onboardingChannel", () => {
  it("names the channel onboarding-{runId}", () => {
    expect(onboardingChannel("run-1")).toBe("onboarding-run-1");
  });
});

describe("broadcastOnboardingProgress", () => {
  afterEach(() => jest.resetAllMocks());

  it("broadcasts the event as-is on the run's channel", () => {
    broadcastOnboardingProgress("run-1", { type: "step", step: "sandbox", message: "Running" });

    expect(mockBroadcast).toHaveBeenCalledWith("onboarding-run-1", "onboarding_progress", {
      type: "step",
      step: "sandbox",
      message: "Running",
    });
  });

  it("supports log and done event types", () => {
    broadcastOnboardingProgress("run-1", { type: "log", message: "cloning repo" });
    broadcastOnboardingProgress("run-1", { type: "done" });

    expect(mockBroadcast).toHaveBeenCalledTimes(2);
    expect(mockBroadcast).toHaveBeenNthCalledWith(1, "onboarding-run-1", "onboarding_progress", {
      type: "log",
      message: "cloning repo",
    });
    expect(mockBroadcast).toHaveBeenNthCalledWith(2, "onboarding-run-1", "onboarding_progress", { type: "done" });
  });
});
