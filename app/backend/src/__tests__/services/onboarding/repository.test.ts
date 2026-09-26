/**
 * Unit tests for the onboarding repository's atomic transition claim
 * (spec 007, WP-BE5, fix round 1 item 1).
 */
jest.mock("../../../utils/database", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import db from "../../../utils/database";
import { claimRunTransition, updateRun, claimPrLease, releasePrLease } from "../../../services/onboarding/repository";

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

describe("claimPrLease / releasePrLease (fix round 2, item 4)", () => {
  afterEach(() => jest.resetAllMocks());

  it("issues a single UPDATE ... WHERE status IN (...) AND (lease unset or expired) ... RETURNING statement", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: "run-1", status: "ready" }] });

    await claimPrLease("run-1");

    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE public\.onboarding_runs/);
    expect(sql).toMatch(/SET pr_lease_until = now\(\) \+ interval/);
    expect(sql).toMatch(/WHERE id = \$1/);
    expect(sql).toMatch(/status IN \('ready', 'prs_open'\)/);
    expect(sql).toMatch(/pr_lease_until IS NULL OR pr_lease_until < now\(\)/);
    expect(sql).toMatch(/RETURNING/);
    expect(params).toEqual(["run-1"]);
  });

  it("returns the claimed row on success", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: "run-1", status: "ready" }] });

    const result = await claimPrLease("run-1");

    expect(result).toEqual({ id: "run-1", status: "ready" });
  });

  it("returns null when the claim finds 0 rows (wrong status, or another confirm already holds the lease)", async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    const result = await claimPrLease("run-1");

    expect(result).toBeNull();
  });

  it("does not open (or hold) a transaction — a single statement via the plain query path", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: "run-1" }] });

    await claimPrLease("run-1");

    // db.query, not db.transaction/getClient — no pooled connection is held
    // across this call or anything after it.
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });

  it("releasePrLease clears the lease unconditionally", async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    await releasePrLease("run-1");

    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE public\.onboarding_runs SET pr_lease_until = NULL/);
    expect(params).toEqual(["run-1"]);
  });
});
