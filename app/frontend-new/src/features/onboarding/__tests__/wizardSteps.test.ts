import { describe, expect, it } from "vitest";
import { furthestStep, resolveStep } from "../wizardSteps";
import { makeRun } from "./fixtures";

describe("furthestStep", () => {
  it("unlocks steps in order", () => {
    expect(furthestStep(undefined)).toBe("team");
    expect(furthestStep(makeRun({ repositories: [] }))).toBe("connect");
    expect(furthestStep(makeRun({ status: "draft" }))).toBe("sandbox");
    expect(furthestStep(makeRun({ status: "running" }))).toBe("sandbox");
    expect(furthestStep(makeRun({ status: "failed" }))).toBe("sandbox");
    expect(furthestStep(makeRun({ status: "ready" }))).toBe("prs");
    expect(furthestStep(makeRun({ status: "prs_open" }))).toBe("prs");
  });
});

describe("resolveStep", () => {
  it("clamps the URL step to what the run has unlocked", () => {
    expect(resolveStep("prs", makeRun({ status: "draft" }))).toBe("sandbox");
    expect(resolveStep("output", makeRun({ status: "ready" }))).toBe("output");
    expect(resolveStep("sandbox", makeRun({ repositories: [] }))).toBe("connect");
  });
  it("falls back for an unknown step, and without a run", () => {
    expect(resolveStep("bogus", makeRun())).toBe("connect");
    expect(resolveStep("output", undefined)).toBe("team");
  });
  it("resumes a started run on a bare URL", () => {
    expect(resolveStep(undefined, makeRun({ status: "draft" }))).toBe("team");
    expect(resolveStep(undefined, makeRun({ status: "running" }))).toBe("sandbox");
    expect(resolveStep(undefined, makeRun({ status: "ready" }))).toBe("output");
    expect(resolveStep(undefined, makeRun({ status: "prs_open" }))).toBe("prs");
  });
});
