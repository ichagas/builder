/**
 * Unit tests for the onboarding run state machine (spec 007, WP-BE5).
 */
import { canTransition, describeInvalidTransition, isTerminal } from "../../../services/onboarding/stateMachine";

describe("onboarding stateMachine", () => {
  it("allows the happy path: draft -> running -> ready -> prs_open -> completed", () => {
    expect(canTransition("draft", "running")).toBe(true);
    expect(canTransition("running", "ready")).toBe(true);
    expect(canTransition("ready", "prs_open")).toBe(true);
    expect(canTransition("prs_open", "completed")).toBe(true);
  });

  it("allows cancelling from draft, running or ready", () => {
    expect(canTransition("draft", "cancelled")).toBe(true);
    expect(canTransition("running", "cancelled")).toBe(true);
    expect(canTransition("ready", "cancelled")).toBe(true);
  });

  it("does not allow cancelling once PRs are open or the run is complete", () => {
    expect(canTransition("prs_open", "cancelled")).toBe(false);
    expect(canTransition("completed", "cancelled")).toBe(false);
  });

  it("rejects skipping straight to prs_open or completed", () => {
    expect(canTransition("draft", "prs_open")).toBe(false);
    expect(canTransition("draft", "completed")).toBe(false);
    expect(canTransition("running", "prs_open")).toBe(false);
  });

  it("rejects a no-op transition", () => {
    expect(canTransition("draft", "draft")).toBe(false);
  });

  it("treats completed, failed and cancelled as terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("draft")).toBe(false);
    expect(isTerminal("running")).toBe(false);
    expect(isTerminal("ready")).toBe(false);
    expect(isTerminal("prs_open")).toBe(false);
  });

  it("describes an invalid transition for the caller's error message", () => {
    expect(describeInvalidTransition("draft", "prs_open")).toContain("draft");
    expect(describeInvalidTransition("draft", "prs_open")).toContain("prs_open");
  });
});
