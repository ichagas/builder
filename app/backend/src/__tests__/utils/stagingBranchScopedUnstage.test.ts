/**
 * Branch-scoped unstage/discard (D-9 / WP-BE2 T104).
 *
 * `unstageFileWithToken`, `unstageFilesWithToken`, `discardStagedWithToken`
 * (rpcHelpers.ts) and `removeStagedFile` (stagedContentStore.ts) all take an
 * optional trailing `branch`: omitted, they behave exactly as before
 * (delete across every branch — this is what keeps the protected legacy
 * staging suites unchanged and green); given, the delete is scoped to that
 * one branch, so another change's staged edit to the same file path on a
 * different branch survives.
 *
 * These tests run against a tiny in-memory fake of `repo_staging` so the
 * "leaves the other branch's row intact" claim is verified against actual
 * row survival, not just the SQL text.
 */

// ---------------------------------------------------------------------------
// A minimal in-memory `repo_staging` fake: interprets exactly the DELETE
// statements these four functions issue, against a plain array of rows.
// ---------------------------------------------------------------------------
type FakeRow = { id: string; repo_id: string; file_path: string; branch: string };

function makeFakeStagingTable(initialRows: FakeRow[]) {
  let rows = [...initialRows];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith("SELECT project_id FROM project_repos")) {
      return { rows: [{ project_id: "project-1" }] };
    }
    if (!sql.startsWith("DELETE FROM repo_staging")) {
      throw new Error(`Unexpected query in fake: ${sql}`);
    }
    const usesAny = sql.includes("file_path = ANY(");
    const hasFilePathFilter = sql.includes("file_path =");
    const hasBranchFilter = sql.includes("AND branch = $");
    const repoId = params[0] as string;
    const filePathParam = hasFilePathFilter ? (params[1] as string | string[]) : undefined;
    const branchParam = hasBranchFilter ? (params[hasFilePathFilter ? 2 : 1] as string) : undefined;

    const before = rows.length;
    const matches = (r: FakeRow) =>
      r.repo_id === repoId &&
      (!hasFilePathFilter ||
        (usesAny ? (filePathParam as string[]).includes(r.file_path) : r.file_path === filePathParam)) &&
      (!hasBranchFilter || r.branch === branchParam);

    const removed = rows.filter(matches);
    rows = rows.filter((r) => !matches(r));
    return { rows: removed.map((r) => ({ id: r.id })), rowCount: before - rows.length };
  });
  return { query, getRows: () => rows };
}

describe("unstageFileWithToken is branch-scoped when a branch is given, legacy (all-branches) otherwise", () => {
  it("with a branch: deletes only that branch's row, leaving the other branch's row intact", async () => {
    jest.resetModules();
    const fake = makeFakeStagingTable([
      { id: "row-a", repo_id: "repo-1", file_path: "src/example.ts", branch: "feat/wi-1-thing" },
      { id: "row-b", repo_id: "repo-1", file_path: "src/example.ts", branch: "fix/wi-2-other" },
    ]);
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: fake.query } }));
    const { unstageFileWithToken } = await import("../../utils/rpcHelpers");

    const deleted = await unstageFileWithToken("repo-1", "src/example.ts", null, "feat/wi-1-thing");

    expect(deleted).toBe(1);
    expect(fake.getRows()).toEqual([
      { id: "row-b", repo_id: "repo-1", file_path: "src/example.ts", branch: "fix/wi-2-other" },
    ]);
  });

  it("without a branch: deletes the row across every branch (legacy behaviour, identical SQL to before)", async () => {
    jest.resetModules();
    const fake = makeFakeStagingTable([
      { id: "row-a", repo_id: "repo-1", file_path: "src/example.ts", branch: "feat/wi-1-thing" },
      { id: "row-b", repo_id: "repo-1", file_path: "src/example.ts", branch: "fix/wi-2-other" },
    ]);
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: fake.query } }));
    const { unstageFileWithToken } = await import("../../utils/rpcHelpers");

    const deleted = await unstageFileWithToken("repo-1", "src/example.ts", null);

    expect(deleted).toBe(2);
    expect(fake.getRows()).toEqual([]);
    expect(fake.query).toHaveBeenCalledWith(
      "DELETE FROM repo_staging WHERE repo_id = $1 AND file_path = $2 RETURNING id",
      ["repo-1", "src/example.ts"],
    );
  });
});

describe("unstageFilesWithToken is branch-scoped when a branch is given, legacy (all-branches) otherwise", () => {
  it("with a branch: deletes only that branch's rows, leaving the other branch's rows intact", async () => {
    jest.resetModules();
    const fake = makeFakeStagingTable([
      { id: "row-a1", repo_id: "repo-1", file_path: "src/one.ts", branch: "feat/wi-1-thing" },
      { id: "row-a2", repo_id: "repo-1", file_path: "src/two.ts", branch: "feat/wi-1-thing" },
      { id: "row-b1", repo_id: "repo-1", file_path: "src/one.ts", branch: "fix/wi-2-other" },
    ]);
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: fake.query } }));
    const { unstageFilesWithToken } = await import("../../utils/rpcHelpers");

    const deleted = await unstageFilesWithToken(
      "repo-1",
      ["src/one.ts", "src/two.ts"],
      null,
      "feat/wi-1-thing",
    );

    expect(deleted).toBe(2);
    expect(fake.getRows()).toEqual([
      { id: "row-b1", repo_id: "repo-1", file_path: "src/one.ts", branch: "fix/wi-2-other" },
    ]);
  });

  it("without a branch: deletes across every branch (legacy behaviour, identical SQL to before)", async () => {
    jest.resetModules();
    const fake = makeFakeStagingTable([
      { id: "row-a1", repo_id: "repo-1", file_path: "src/one.ts", branch: "feat/wi-1-thing" },
      { id: "row-b1", repo_id: "repo-1", file_path: "src/one.ts", branch: "fix/wi-2-other" },
    ]);
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: fake.query } }));
    const { unstageFilesWithToken } = await import("../../utils/rpcHelpers");

    const deleted = await unstageFilesWithToken("repo-1", ["src/one.ts"], null);

    expect(deleted).toBe(2);
    expect(fake.query).toHaveBeenCalledWith(
      "DELETE FROM repo_staging WHERE repo_id = $1 AND file_path = ANY($2) RETURNING id",
      ["repo-1", ["src/one.ts"]],
    );
  });
});

describe("discardStagedWithToken is branch-scoped when a branch is given, legacy (all-branches) otherwise", () => {
  it("with a branch: discards only that branch's rows, leaving the other branch's row intact", async () => {
    jest.resetModules();
    const fake = makeFakeStagingTable([
      { id: "row-a1", repo_id: "repo-1", file_path: "src/one.ts", branch: "feat/wi-1-thing" },
      { id: "row-a2", repo_id: "repo-1", file_path: "src/two.ts", branch: "feat/wi-1-thing" },
      { id: "row-b1", repo_id: "repo-1", file_path: "src/one.ts", branch: "fix/wi-2-other" },
    ]);
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: fake.query } }));
    const { discardStagedWithToken } = await import("../../utils/rpcHelpers");

    const deleted = await discardStagedWithToken("repo-1", null, "feat/wi-1-thing");

    expect(deleted).toBe(2);
    expect(fake.getRows()).toEqual([
      { id: "row-b1", repo_id: "repo-1", file_path: "src/one.ts", branch: "fix/wi-2-other" },
    ]);
  });

  it("without a branch: discards every branch's rows (legacy behaviour, identical SQL to before)", async () => {
    jest.resetModules();
    const fake = makeFakeStagingTable([
      { id: "row-a1", repo_id: "repo-1", file_path: "src/one.ts", branch: "feat/wi-1-thing" },
      { id: "row-b1", repo_id: "repo-1", file_path: "src/one.ts", branch: "fix/wi-2-other" },
    ]);
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: fake.query } }));
    const { discardStagedWithToken } = await import("../../utils/rpcHelpers");

    const deleted = await discardStagedWithToken("repo-1", null);

    expect(deleted).toBe(2);
    expect(fake.getRows()).toEqual([]);
    expect(fake.query).toHaveBeenCalledWith("DELETE FROM repo_staging WHERE repo_id = $1", ["repo-1"]);
  });
});

describe("getStagedChangesWithToken is branch-scoped when a branch is given, legacy (all-branches) otherwise", () => {
  it("with a branch: lists only that branch's rows", async () => {
    jest.resetModules();
    const mockQuery = jest.fn().mockResolvedValueOnce({
      rows: [{ id: "row-a1", repo_id: "repo-1", file_path: "src/one.ts", branch: "feat/wi-1-thing" }],
    });
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: mockQuery } }));
    const { getStagedChangesWithToken } = await import("../../utils/rpcHelpers");

    const rows = await getStagedChangesWithToken("repo-1", null, "feat/wi-1-thing");

    expect(rows).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT * FROM repo_staging WHERE repo_id = $1 AND branch = $2 ORDER BY created_at",
      ["repo-1", "feat/wi-1-thing"],
    );
  });

  it("without a branch: lists across every branch (legacy behaviour, identical SQL to before)", async () => {
    jest.resetModules();
    const mockQuery = jest.fn().mockResolvedValueOnce({ rows: [] });
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: mockQuery } }));
    const { getStagedChangesWithToken } = await import("../../utils/rpcHelpers");

    await getStagedChangesWithToken("repo-1", null);

    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT * FROM repo_staging WHERE repo_id = $1 ORDER BY created_at",
      ["repo-1"],
    );
  });
});

describe("removeStagedFile is branch-scoped when a branch is given, legacy (all-branches) otherwise", () => {
  it("with a branch: removes only that branch's row, leaving the other branch's row intact", async () => {
    jest.resetModules();
    const fake = makeFakeStagingTable([
      { id: "row-a", repo_id: "repo-1", file_path: "src/example.ts", branch: "feat/wi-1-thing" },
      { id: "row-b", repo_id: "repo-1", file_path: "src/example.ts", branch: "fix/wi-2-other" },
    ]);
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: fake.query } }));
    jest.doMock("../../utils/repoBlobStore", () => ({
      getRepoBlobStore: () => ({ deleteStaged: jest.fn().mockResolvedValue(undefined) }),
    }));
    const { removeStagedFile } = await import("../../staging/stagedContentStore");

    await removeStagedFile("repo-1", "src/example.ts", "feat/wi-1-thing");

    expect(fake.getRows()).toEqual([
      { id: "row-b", repo_id: "repo-1", file_path: "src/example.ts", branch: "fix/wi-2-other" },
    ]);
  });

  it("without a branch: removes the row across every branch (legacy behaviour, identical SQL to before)", async () => {
    jest.resetModules();
    const fake = makeFakeStagingTable([
      { id: "row-a", repo_id: "repo-1", file_path: "src/example.ts", branch: "feat/wi-1-thing" },
      { id: "row-b", repo_id: "repo-1", file_path: "src/example.ts", branch: "fix/wi-2-other" },
    ]);
    jest.doMock("../../utils/database", () => ({ __esModule: true, default: { query: fake.query } }));
    jest.doMock("../../utils/repoBlobStore", () => ({
      getRepoBlobStore: () => ({ deleteStaged: jest.fn().mockResolvedValue(undefined) }),
    }));
    const { removeStagedFile } = await import("../../staging/stagedContentStore");

    await removeStagedFile("repo-1", "src/example.ts");

    expect(fake.getRows()).toEqual([]);
    expect(fake.query).toHaveBeenCalledWith(
      "DELETE FROM repo_staging WHERE repo_id = $1 AND file_path = $2",
      ["repo-1", "src/example.ts"],
    );
  });
});
