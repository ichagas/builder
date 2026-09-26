/**
 * Unit tests for the onboarding repository's atomic transition claim
 * (spec 007, WP-BE5, fix round 1 item 1).
 */
jest.mock("../../../utils/database", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import db from "../../../utils/database";
import { claimRunTransition, updateRun } from "../../../services/onboarding/repository";

const mockDbQuery = db.query as jest.Mock;

describe("claimRunTransition", () => {
  afterEach(() => jest.resetAllMocks());

  it("issues a single UPDATE ... WHERE id = ... AND status = ... RETURNING statement", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: "run-1", status: "running" }] });

    await claimRunTransition("run-1", "draft", { status: "running", step: "sandbox" });

    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE public\.onboarding_runs/);
    expect(sql).toMatch(/WHERE id = \$\d+ AND status = \$\d+/);
    expect(sql).toMatch(/RETURNING/);
    // The claim's WHERE clause parameters: run id then the *expected*
    // current status — this is what makes the claim atomic under Postgres's
    // normal single-statement UPDATE semantics (only a row still matching
    // both predicates at evaluation time is updated).
    expect(params).toEqual(expect.arrayContaining(["run-1", "draft"]));
  });

  it("returns the updated row when the claim succeeds (the WHERE matched)", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: "run-1", status: "running", step: "sandbox" }] });

    const result = await claimRunTransition("run-1", "draft", { status: "running", step: "sandbox" });

    expect(result).toEqual({ id: "run-1", status: "running", step: "sandbox" });
  });

  it("returns null when the claim loses the race (0 rows updated)", async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    const result = await claimRunTransition("run-1", "draft", { status: "running", step: "sandbox" });

    expect(result).toBeNull();
  });

  it("never touches the row when a plain updateRun is used instead (no status guard)", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: "run-1", status: "cancelled" }] });

    await updateRun("run-1", { status: "cancelled" });

    const [sql] = mockDbQuery.mock.calls[0];
    expect(sql).not.toMatch(/AND status = /);
  });
});
