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
import { isConnectionInUse } from "../../../services/integrations/connectionRepository";

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
