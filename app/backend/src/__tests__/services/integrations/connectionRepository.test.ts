/**
 * Unit tests for the integration_connections repository (spec 007, WP-BE8).
 * Focus: `isConnectionInUse` must check both application_repositories and
 * onboarding_runs (guarded, since onboarding_runs may not exist yet in every
 * environment — see migration 016's DO block).
 */
jest.mock("../../../utils/database", () => {
  const queryFn = jest.fn();
  return { __esModule: true, default: { query: queryFn, healthCheck: jest.fn(), getActiveDbPort: jest.fn() } };
});

import db from "../../../utils/database";
import { isConnectionInUse, updateConnectionFields } from "../../../services/integrations/connectionRepository";

const mockDbQuery = db.query as jest.Mock;

describe("isConnectionInUse", () => {
  beforeEach(() => mockDbQuery.mockReset());

  it("returns true when a repository references the connection (skips the onboarding_runs check)", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // application_repositories

    const result = await isConnectionInUse("conn-1");

    expect(result).toBe(true);
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });

  it("returns false when nothing references it and onboarding_runs doesn't exist", async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // application_repositories: none
      .mockResolvedValueOnce({ rows: [{ exists: false }] }); // to_regclass check

    const result = await isConnectionInUse("conn-1");

    expect(result).toBe(false);
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  it("checks onboarding_runs when the table exists, and returns true if referenced there", async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // application_repositories: none
      .mockResolvedValueOnce({ rows: [{ exists: true }] }) // to_regclass check
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // onboarding_runs: referenced

    const result = await isConnectionInUse("conn-1");

    expect(result).toBe(true);
    expect(mockDbQuery).toHaveBeenCalledTimes(3);
  });

  it("returns false when the table exists but nothing references the connection", async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await isConnectionInUse("conn-1");

    expect(result).toBe(false);
  });
});

describe("updateConnectionFields", () => {
  beforeEach(() => mockDbQuery.mockReset());

  it("updates only displayName when scope isn't given", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: "conn-1", display_name: "New name" }] });

    await updateConnectionFields("conn-1", { displayName: "New name" });

    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).toContain("display_name = $1");
    expect(sql).not.toContain("scope = $");
    expect(params).toEqual(["New name", "conn-1"]);
  });

  it("updates only scope when displayName isn't given", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: "conn-1", scope: { owners: ["goa"] } }] });

    await updateConnectionFields("conn-1", { scope: { owners: ["goa"] } });

    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).not.toContain("display_name = $");
    expect(sql).toContain("scope = $1");
    expect(params).toEqual([JSON.stringify({ owners: ["goa"] }), "conn-1"]);
  });

  it("updates both fields together, id last", async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ id: "conn-1" }] });

    await updateConnectionFields("conn-1", { displayName: "New name", scope: { owners: ["goa"] } });

    const [, params] = mockDbQuery.mock.calls[0];
    expect(params).toEqual(["New name", JSON.stringify({ owners: ["goa"] }), "conn-1"]);
  });
});
