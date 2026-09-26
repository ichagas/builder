/**
 * Unit tests for the B1 project-access helper (`services/versions/access.ts`).
 *
 * These exercise `checkProjectAccess` / `requireAccess` / `authorizeProject`
 * directly, in isolation from the route handlers, so all three token roles
 * (owner/editor/viewer), expiry, and error propagation are covered without
 * duplicating the same assertions through every route.
 */
import {
  checkProjectAccess,
  requireAccess,
  authorizeProject,
  tokenFromQuery,
} from "../../../services/versions/access";

jest.mock("../../../utils/database", () => {
  const queryFn = jest.fn();
  return {
    __esModule: true,
    default: {
      query: queryFn,
      healthCheck: jest.fn(),
      getActiveDbPort: jest.fn(),
    },
  };
});

import db from "../../../utils/database";
const mockDbQuery = db.query as jest.Mock;

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const OWNER_ID = "owner-user";

function mockOwnerCheck(createdBy: string | null) {
  mockDbQuery.mockResolvedValueOnce({ rows: createdBy === null ? [] : [{ created_by: createdBy }] });
}

function mockTokenRoleCheck(role: string | null) {
  mockDbQuery.mockResolvedValueOnce({ rows: role ? [{ role }] : [] });
}

beforeEach(() => {
  mockDbQuery.mockReset();
});

describe("checkProjectAccess", () => {
  it("reports the project as missing when no row exists", async () => {
    mockOwnerCheck(null);
    const access = await checkProjectAccess(PROJECT_ID, OWNER_ID, undefined);
    expect(access).toEqual({ projectExists: false, role: null });
  });

  it("resolves 'owner' for the authenticated project creator, without consulting project_tokens", async () => {
    mockOwnerCheck(OWNER_ID);
    const access = await checkProjectAccess(PROJECT_ID, OWNER_ID, undefined);
    expect(access).toEqual({ projectExists: true, role: "owner" });
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });

  it("resolves null role when there is no token and the user isn't the owner", async () => {
    mockOwnerCheck("someone-else");
    const access = await checkProjectAccess(PROJECT_ID, OWNER_ID, undefined);
    expect(access).toEqual({ projectExists: true, role: null });
  });

  it.each(["owner", "editor", "viewer"] as const)(
    "resolves the '%s' role from a valid, unexpired project_tokens row",
    async (role) => {
      mockOwnerCheck("someone-else");
      mockTokenRoleCheck(role);
      const access = await checkProjectAccess(PROJECT_ID, undefined, "some-token");
      expect(access).toEqual({ projectExists: true, role });
    }
  );

  it("treats an unknown or expired token as no access (role: null)", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck(null); // the SQL predicate excludes expired rows, so the lookup returns nothing
    const access = await checkProjectAccess(PROJECT_ID, undefined, "expired-or-unknown-token");
    expect(access).toEqual({ projectExists: true, role: null });
  });

  it("queries project_tokens with the project id, token, and an expiry predicate", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("editor");
    await checkProjectAccess(PROJECT_ID, undefined, "editor-token");

    const [sql, params] = mockDbQuery.mock.calls[1];
    expect(sql).toMatch(/project_tokens/);
    expect(sql).toMatch(/expires_at/);
    expect(params).toEqual([PROJECT_ID, "editor-token"]);
  });

  it("KNOWN DEFECT: a malformed (non-UUID) token propagates the raw Postgres error instead of resolving to no access", async () => {
    // `project_tokens.token` is a `uuid` column. In the real database (see
    // manual verification against postgres:16-alpine for T100/T101), a
    // `?token=` value that isn't UUID-shaped fails the query with
    // `22P02 invalid input syntax for type uuid`, not a 0-row result. That
    // raw driver error has no `statusCode`, so `middleware/errorHandler`
    // falls back to 500 instead of the 403 a caller would expect for bad
    // credentials. This test pins the current (buggy) propagation so a fix
    // is visible as a test change rather than a silent behavior shift.
    mockOwnerCheck("someone-else");
    const pgError: any = new Error('invalid input syntax for type uuid: "not-a-uuid"');
    pgError.code = "22P02";
    mockDbQuery.mockRejectedValueOnce(pgError);

    await expect(checkProjectAccess(PROJECT_ID, undefined, "not-a-uuid")).rejects.toMatchObject({
      code: "22P02",
    });
  });
});

describe("requireAccess", () => {
  it("throws 404 when the project doesn't exist", () => {
    expect(() => requireAccess({ projectExists: false, role: null })).toThrow(/not found/i);
  });

  it("throws 403 when there is no role", () => {
    expect(() => requireAccess({ projectExists: true, role: null })).toThrow(/access denied/i);
  });

  it("throws 403 for a viewer on a mutating endpoint", () => {
    expect(() => requireAccess({ projectExists: true, role: "viewer" }, { mutating: true })).toThrow(
      /read-only/i
    );
  });

  it.each(["editor", "owner"] as const)("allows '%s' to mutate", (role) => {
    expect(requireAccess({ projectExists: true, role }, { mutating: true })).toBe(role);
  });

  it("allows viewer on a non-mutating endpoint", () => {
    expect(requireAccess({ projectExists: true, role: "viewer" })).toBe("viewer");
  });
});

describe("authorizeProject", () => {
  it("resolves the role for a valid owner-role token (mutating allowed)", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("owner");
    const role = await authorizeProject(PROJECT_ID, undefined, "owner-token", { mutating: true });
    expect(role).toBe("owner");
  });

  it("rejects a viewer-role token on a mutating call", async () => {
    mockOwnerCheck("someone-else");
    mockTokenRoleCheck("viewer");
    await expect(
      authorizeProject(PROJECT_ID, undefined, "viewer-token", { mutating: true })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects with 404 before ever checking mutating rules when the project is missing", async () => {
    mockOwnerCheck(null);
    await expect(authorizeProject(PROJECT_ID, undefined, "any-token")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("tokenFromQuery", () => {
  it("returns undefined for missing, empty, or non-string query values", () => {
    expect(tokenFromQuery(undefined)).toBeUndefined();
    expect(tokenFromQuery("")).toBeUndefined();
    expect(tokenFromQuery(["a", "b"])).toBeUndefined();
  });

  it("returns the token string as-is when present", () => {
    expect(tokenFromQuery("abc-123")).toBe("abc-123");
  });
});
