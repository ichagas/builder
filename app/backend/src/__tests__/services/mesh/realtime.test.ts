/**
 * Unit tests for services/mesh/realtime.ts (spec 007, WP-BE4, T124).
 */
import {
  teamChannel,
  broadcastMeshRunReceived,
  broadcastPrStateChanged,
  broadcastApplicationAdded,
  isNotReporting,
  NOT_REPORTING_DAYS,
} from "../../../services/mesh/realtime";

const mockBroadcast = jest.fn();
jest.mock("../../../websocket", () => ({
  broadcast: (...args: any[]) => mockBroadcast(...args),
}));

beforeEach(() => {
  mockBroadcast.mockReset();
});

describe("teamChannel", () => {
  it("builds team-{teamId}", () => {
    expect(teamChannel("team-1")).toBe("team-team-1");
  });
});

describe("broadcast helpers", () => {
  it("broadcastMeshRunReceived sends on the team channel with the 'mesh_run_received' event", () => {
    broadcastMeshRunReceived({
      teamId: "team-1",
      applicationId: "app-1",
      repositoryId: "repo-1",
      runId: "run-1",
      prNumber: 1,
      prState: "open",
      newFindings: 2,
    });
    expect(mockBroadcast).toHaveBeenCalledWith(
      "team-team-1",
      "mesh_run_received",
      expect.objectContaining({ runId: "run-1" }),
    );
  });

  it("broadcastPrStateChanged sends on the team channel with the 'pr_state_changed' event", () => {
    broadcastPrStateChanged({ teamId: "team-1", applicationId: "app-1", prState: "merged" });
    expect(mockBroadcast).toHaveBeenCalledWith(
      "team-team-1",
      "pr_state_changed",
      expect.objectContaining({ prState: "merged" }),
    );
  });

  it("broadcastApplicationAdded sends on the team channel with the 'app_added' event", () => {
    broadcastApplicationAdded({ teamId: "team-1", applicationId: "app-2", name: "Permits API" });
    expect(mockBroadcast).toHaveBeenCalledWith(
      "team-team-1",
      "app_added",
      expect.objectContaining({ name: "Permits API" }),
    );
  });
});

describe("isNotReporting (research D-10: no report for 7 days)", () => {
  it("is false before the application has ever onboarded", () => {
    expect(isNotReporting(null, null)).toBe(false);
  });

  it("is true once onboarded but never reported", () => {
    expect(isNotReporting("2026-01-01T00:00:00Z", null)).toBe(true);
  });

  it(`is true when the last report is older than ${NOT_REPORTING_DAYS} days`, () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(isNotReporting("2026-01-01T00:00:00Z", eightDaysAgo)).toBe(true);
  });

  it("is false when the last report is within the window", () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isNotReporting("2026-01-01T00:00:00Z", oneDayAgo)).toBe(false);
  });
});
