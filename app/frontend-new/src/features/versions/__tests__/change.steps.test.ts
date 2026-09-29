import { describe, expect, it } from "vitest";
import { isLocked, nodeLabel, resolveStep, scopeNodes, stepAction, stepAfterDefine, stepStates } from "../change/steps";

describe("change steps (NV-03)", () => {
  it("fills missing phase_state keys with todo", () => {
    expect(stepStates({ phase_state: { define: "done", build: "active" } })).toEqual({
      define: "done",
      design: "todo",
      build: "active",
      ship: "todo",
    });
    expect(stepStates({ phase_state: null }).define).toBe("todo");
  });

  it("resolves the step from the URL, else the first active, else the first todo", () => {
    const s = stepStates({ phase_state: { define: "done", design: "skipped", build: "active", ship: "todo" } });
    expect(resolveStep("design", s)).toBe("design");
    expect(resolveStep("bogus", s)).toBe("build");
    expect(resolveStep(undefined, stepStates({ phase_state: {} }))).toBe("define");
    expect(resolveStep(undefined, stepStates({ phase_state: { define: "done", design: "done", build: "done", ship: "done" } }))).toBe("ship");
  });

  it("goes to Build after Define when design is skipped", () => {
    expect(stepAfterDefine(stepStates({ phase_state: { design: "skipped" } }))).toBe("build");
    expect(stepAfterDefine(stepStates({ phase_state: { design: "todo" } }))).toBe("design");
  });

  it("offers one primary action per step", () => {
    const s = stepStates({ phase_state: { define: "active", design: "skipped", build: "active", ship: "todo" } });
    const open = { locked: false, agentRunning: false };
    expect(stepAction("define", s, open)?.action).toEqual({ kind: "complete", step: "define" });
    expect(stepAction("design", s, open)?.action).toEqual({ kind: "unskip" });
    expect(stepAction("build", s, open)?.disabledReasonKey).toBeUndefined();
    expect(stepAction("ship", s, open)?.action).toEqual({ kind: "openRelease" });
  });

  it("disables Send for review while the agent runs, and offers nothing when locked", () => {
    const s = stepStates({ phase_state: { build: "active" } });
    expect(stepAction("build", s, { locked: false, agentRunning: true })?.disabledReasonKey).toBe("versions.change.build.waitForAgent");
    expect(stepAction("build", s, { locked: true, agentRunning: false })).toBeUndefined();
  });

  it("locks shipped, declined and released-version changes", () => {
    expect(isLocked({ status: "active" }, false)).toBe(false);
    expect(isLocked({ status: "shipped" }, false)).toBe(true);
    expect(isLocked({ status: "declined" }, false)).toBe(true);
    expect(isLocked({ status: "active" }, true)).toBe(true);
  });

  it("splits canvas nodes into affected and others, and labels them", () => {
    const nodes = [
      { id: "a", type: "API", data: { label: "Email service" } },
      { id: "b", type: "DATABASE", data: {} },
    ];
    const { affected, others } = scopeNodes(nodes, ["a"]);
    expect(affected.map((n) => n.id)).toEqual(["a"]);
    expect(others.map((n) => n.id)).toEqual(["b"]);
    expect(nodeLabel(nodes[0])).toBe("Email service");
    expect(nodeLabel(nodes[1])).toBe("DATABASE");
  });
});
