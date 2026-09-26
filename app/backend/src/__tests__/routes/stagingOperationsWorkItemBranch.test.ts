/**
 * `POST /functions/staging-operations` resolves a `workItemId` to that
 * change's real Git branch (D-9 / WP-BE2 T104, `branchService.stagingBranchForWorkItem`)
 * when the caller doesn't already name a `branch` directly.
 */
import express from "express";
import request from "supertest";

const mockStageFileChangeWithToken = jest.fn();
const mockCommitStagedWithToken = jest.fn();
const mockDbQuery = jest.fn();
const mockBroadcast = jest.fn();
const mockStagingBranchForWorkItem = jest.fn();

jest.mock("../../utils/rpcHelpers", () => ({
  stageFileChangeWithToken: (...args: unknown[]) => mockStageFileChangeWithToken(...args),
  commitStagedWithToken: (...args: unknown[]) => mockCommitStagedWithToken(...args),
  unstageFileWithToken: jest.fn(),
  unstageFilesWithToken: jest.fn(),
  discardStagedWithToken: jest.fn(),
}));

jest.mock("../../services/versions/branchService", () => ({
  stagingBranchForWorkItem: (...args: unknown[]) => mockStagingBranchForWorkItem(...args),
}));

jest.mock("../../utils/database", () => ({
  __esModule: true,
  default: { query: mockDbQuery, getClient: jest.fn() },
}));

jest.mock("../../websocket", () => ({
  broadcast: mockBroadcast,
}));

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import functionsRouter from "../../routes/functions";

const app = express();
app.use(express.json());
app.use("/functions", functionsRouter);

beforeEach(() => {
  mockStageFileChangeWithToken.mockReset();
  mockCommitStagedWithToken.mockReset();
  mockDbQuery.mockReset();
  mockBroadcast.mockReset();
  mockStagingBranchForWorkItem.mockReset();

  mockStageFileChangeWithToken.mockResolvedValue({ id: "stage-1" });
  mockCommitStagedWithToken.mockResolvedValue({ id: "commit-1" });
  mockDbQuery.mockResolvedValue({ rows: [{ project_id: "project-1" }] });
});

describe("staging-operations workItemId -> branch resolution", () => {
  it("resolves workItemId to a branch and uses it for stage", async () => {
    mockStagingBranchForWorkItem.mockResolvedValueOnce("fix/wi-1-something-broke");

    const res = await request(app).post("/functions/staging-operations").send({
      action: "stage",
      repoId: "repo-1",
      filePath: "src/example.ts",
      operationType: "modify",
      newContent: "new",
      workItemId: "wi-1",
    });

    expect(res.status).toBe(200);
    expect(mockStagingBranchForWorkItem).toHaveBeenCalledWith("wi-1");
    expect(mockStageFileChangeWithToken).toHaveBeenCalledWith(
      "repo-1",
      null,
      "src/example.ts",
      "modify",
      null,
      "new",
      null,
      "fix/wi-1-something-broke",
    );
  });

  it("an explicit branch wins over workItemId", async () => {
    const res = await request(app).post("/functions/staging-operations").send({
      action: "stage",
      repoId: "repo-1",
      filePath: "src/example.ts",
      operationType: "modify",
      newContent: "new",
      branch: "explicit-branch",
      workItemId: "wi-1",
    });

    expect(res.status).toBe(200);
    expect(mockStagingBranchForWorkItem).not.toHaveBeenCalled();
    expect(mockStageFileChangeWithToken).toHaveBeenCalledWith(
      "repo-1",
      null,
      "src/example.ts",
      "modify",
      null,
      "new",
      null,
      "explicit-branch",
    );
  });

  it("never fails the request when branch resolution throws", async () => {
    mockStagingBranchForWorkItem.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).post("/functions/staging-operations").send({
      action: "stage",
      repoId: "repo-1",
      filePath: "src/example.ts",
      operationType: "modify",
      newContent: "new",
      workItemId: "wi-1",
    });

    expect(res.status).toBe(200);
    expect(mockStageFileChangeWithToken).toHaveBeenCalledWith(
      "repo-1",
      null,
      "src/example.ts",
      "modify",
      null,
      "new",
      null,
      null,
    );
  });

  it("uses the resolved branch for commit too", async () => {
    mockStagingBranchForWorkItem.mockResolvedValueOnce("fix/wi-1-something-broke");

    const res = await request(app).post("/functions/staging-operations").send({
      action: "commit",
      repoId: "repo-1",
      commitMessage: "Fix the thing",
      workItemId: "wi-1",
    });

    expect(res.status).toBe(200);
    expect(mockCommitStagedWithToken).toHaveBeenCalledWith(
      "repo-1",
      null,
      "Fix the thing",
      "fix/wi-1-something-broke",
      null,
    );
  });

  it("defaults to 'main' with no workItemId or branch", async () => {
    const res = await request(app).post("/functions/staging-operations").send({
      action: "commit",
      repoId: "repo-1",
      commitMessage: "Fix the thing",
    });

    expect(res.status).toBe(200);
    expect(mockStagingBranchForWorkItem).not.toHaveBeenCalled();
    expect(mockCommitStagedWithToken).toHaveBeenCalledWith("repo-1", null, "Fix the thing", "main", null);
  });
});
