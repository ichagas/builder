/**
 * Tests for the staging `branch` dimension (D-9 / WP-BE2 T104): each RPC
 * that reads, writes, or commits `repo_staging` rows filters by branch
 * (defaulting to 'main', identical to legacy pre-branch-dimension
 * behaviour) so that two changes' staged edits to the same file path never
 * collide or leak into each other's commit.
 */
import "express-async-errors";
import express from "express";
import request from "supertest";

const mockDbQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockGetClient = jest.fn();
const mockBroadcast = jest.fn();
const mockReadStaged = jest.fn();
const mockDeleteStaged = jest.fn();
const mockReadCommitted = jest.fn();

jest.mock("../../utils/database", () => ({
  __esModule: true,
  default: {
    query: mockDbQuery,
    getClient: mockGetClient,
  },
}));

jest.mock("../../utils/repoBlobStore", () => ({
  getRepoBlobStore: jest.fn(() => ({
    readStaged: mockReadStaged,
    deleteStaged: mockDeleteStaged,
    readCommitted: mockReadCommitted,
    writeCommitted: jest.fn(),
    deleteCommitted: jest.fn(),
  })),
}));

jest.mock("../../websocket", () => ({
  broadcast: mockBroadcast,
}));

jest.mock("../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockStageFileChangeWithToken = jest.fn();
const mockBatchStageFiles = jest.fn();
jest.mock("../../utils/rpcHelpers", () => {
  const actual = jest.requireActual("../../utils/rpcHelpers");
  return {
    ...actual,
    stageFileChangeWithToken: (...args: unknown[]) => mockStageFileChangeWithToken(...args),
    batchStageFiles: (...args: unknown[]) => mockBatchStageFiles(...args),
  };
});

import rpcRouter from "../../routes/rpc";

const app = express();
app.use(express.json());
app.use("/rpc", rpcRouter);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ data: null, error: error.message });
});

beforeEach(() => {
  mockDbQuery.mockReset();
  mockClientQuery.mockReset();
  mockClientRelease.mockReset();
  mockGetClient.mockReset();
  mockBroadcast.mockReset();
  mockReadStaged.mockReset();
  mockDeleteStaged.mockReset();
  mockReadCommitted.mockReset();
  mockStageFileChangeWithToken.mockReset();
  mockBatchStageFiles.mockReset();

  mockGetClient.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockStageFileChangeWithToken.mockResolvedValue({ id: "stage-1" });
  mockBatchStageFiles.mockResolvedValue({ staged_count: 1, files: ["src/a.ts"] });
});

describe("stage_file_change_with_token forwards p_branch", () => {
  it("passes p_branch through to stageFileChangeWithToken", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ project_id: "project-1" }] });

    const res = await request(app).post("/rpc/stage_file_change_with_token").send({
      p_repo_id: "repo-1",
      p_file_path: "src/example.ts",
      p_operation_type: "edit",
      p_new_content: "new",
      p_branch: "feat/wi-1-thing",
    });

    expect(res.status).toBe(200);
    expect(mockStageFileChangeWithToken).toHaveBeenCalledWith(
      "repo-1",
      null,
      "src/example.ts",
      "edit",
      null,
      "new",
      null,
      "feat/wi-1-thing",
    );
  });

  it("defaults to null (legacy 'main') when p_branch is omitted", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ project_id: "project-1" }] });

    await request(app).post("/rpc/stage_file_change_with_token").send({
      p_repo_id: "repo-1",
      p_file_path: "src/example.ts",
      p_operation_type: "edit",
      p_new_content: "new",
    });

    expect(mockStageFileChangeWithToken).toHaveBeenCalledWith(
      "repo-1",
      null,
      "src/example.ts",
      "edit",
      null,
      "new",
      null,
      null,
    );
  });
});

describe("batch_stage_files_with_token propagates branch per file", () => {
  it("applies a top-level p_branch to every file that doesn't name its own", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ project_id: "project-1" }] });

    await request(app)
      .post("/rpc/batch_stage_files_with_token")
      .send({
        p_repo_id: "repo-1",
        p_project_id: "project-1",
        p_branch: "feat/wi-1-thing",
        p_files: [
          { file_path: "src/a.ts", operation_type: "create", new_content: "a" },
          { file_path: "src/b.ts", operation_type: "create", new_content: "b", branch: "fix/wi-2-other" },
        ],
      });

    expect(mockBatchStageFiles).toHaveBeenCalledWith(
      "repo-1",
      null,
      [
        expect.objectContaining({ filePath: "src/a.ts", branch: "feat/wi-1-thing" }),
        expect.objectContaining({ filePath: "src/b.ts", branch: "fix/wi-2-other" }),
      ],
      "project-1",
    );
  });
});

describe("get_staged_changes_with_token is branch-scoped", () => {
  it("defaults to 'main' when p_branch is omitted", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await request(app).post("/rpc/get_staged_changes_with_token").send({ p_repo_id: "repo-1" });

    expect(mockDbQuery).toHaveBeenCalledWith(
      "SELECT * FROM repo_staging WHERE repo_id = $1 AND branch = $2 ORDER BY created_at",
      ["repo-1", "main"],
    );
  });

  it("filters by the named branch", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/rpc/get_staged_changes_with_token")
      .send({ p_repo_id: "repo-1", p_branch: "feat/wi-1-thing" });

    expect(mockDbQuery).toHaveBeenCalledWith(
      "SELECT * FROM repo_staging WHERE repo_id = $1 AND branch = $2 ORDER BY created_at",
      ["repo-1", "feat/wi-1-thing"],
    );
  });
});

describe("get_staged_changes_metadata_with_token is branch-scoped", () => {
  it("defaults to 'main' when p_branch is omitted", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await request(app).post("/rpc/get_staged_changes_metadata_with_token").send({ p_repo_id: "repo-1" });

    const [sql, sqlParams] = mockDbQuery.mock.calls[0];
    expect(sql).toContain("WHERE repo_id = $1 AND branch = $2");
    expect(sqlParams).toEqual(["repo-1", "main"]);
  });
});

describe("get_staged_file_content_with_token is branch-scoped", () => {
  it("reads the named branch's staged row, defaulting to 'main'", async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ operation_type: "modify", is_binary: false, old_path: null, project_id: "project-1", branch: "main" }],
    });
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ operation_type: "modify", is_binary: false, old_path: null, project_id: "project-1", branch: "main" }],
    });
    mockReadStaged.mockResolvedValueOnce("new content");
    mockReadCommitted.mockResolvedValueOnce("old content");
    mockDbQuery.mockResolvedValueOnce({ rows: [{ project_id: "project-1" }] });

    const res = await request(app)
      .post("/rpc/get_staged_file_content_with_token")
      .send({ p_repo_id: "repo-1", p_file_path: "src/example.ts" });

    expect(res.status).toBe(200);
    expect(mockDbQuery.mock.calls[0]).toEqual([
      "SELECT operation_type, is_binary FROM repo_staging WHERE repo_id = $1 AND file_path = $2 AND branch = $3",
      ["repo-1", "src/example.ts", "main"],
    ]);
  });
});

describe("unstage_file_with_token is branch-scoped", () => {
  it("deletes only the named branch's staged row, defaulting to 'main'", async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ project_id: "project-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "stage-1" }] });

    await request(app)
      .post("/rpc/unstage_file_with_token")
      .send({ p_repo_id: "repo-1", p_file_path: "src/example.ts", p_branch: "feat/wi-1-thing" });

    expect(mockDbQuery).toHaveBeenCalledWith(
      "DELETE FROM repo_staging WHERE repo_id = $1 AND file_path = $2 AND branch = $3 RETURNING id",
      ["repo-1", "src/example.ts", "feat/wi-1-thing"],
    );
  });
});

describe("commit_staged_with_token commits only the named branch's staged rows", () => {
  const repoRow = { project_id: "project-1" };
  const commitRow = { id: "commit-1", files_changed: 1 };

  it("selects, commits, and clears staging scoped to p_branch (not 'main')", async () => {
    mockReadStaged.mockResolvedValueOnce("blob content");
    mockDeleteStaged.mockResolvedValueOnce(undefined);
    mockClientQuery
      .mockResolvedValueOnce({ rows: [repoRow] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ repo_id: "repo-1", file_path: "src/example.ts", operation_type: "modify", old_path: null }] })
      .mockResolvedValueOnce({ rows: [commitRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);

    const res = await request(app).post("/rpc/commit_staged_with_token").send({
      p_repo_id: "repo-1",
      p_commit_message: "Commit",
      p_branch: "feat/wi-1-thing",
    });

    expect(res.status).toBe(200);
    expect(mockClientQuery.mock.calls[2]).toEqual([
      "SELECT * FROM repo_staging WHERE repo_id = $1 AND branch = $2",
      ["repo-1", "feat/wi-1-thing"],
    ]);
    expect(mockClientQuery.mock.calls[5]).toEqual([
      "DELETE FROM repo_staging WHERE repo_id = $1 AND branch = $2",
      ["repo-1", "feat/wi-1-thing"],
    ]);
  });
});
