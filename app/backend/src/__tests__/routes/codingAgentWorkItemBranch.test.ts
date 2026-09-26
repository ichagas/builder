/**
 * `POST /functions/coding-agent-orchestrator` resolves an optional
 * `workItemId` to that change's real Git branch (D-9 / WP-BE2 T104,
 * `branchService.stagingBranchForWorkItem`) and routes its staged edits
 * there instead of the repo's default 'main' staging branch.
 *
 * Mirrors `aiBatchStaging.test.ts`'s scaffold (a protected legacy suite that
 * must stay unchanged) without a `workItemId`, plus new coverage for when
 * one is given.
 */
import express from "express";
import request from "supertest";

const mockStageFileChangeWithToken = jest.fn();
const mockBatchStageFiles = jest.fn();
const mockBroadcast = jest.fn();
const mockDbQuery = jest.fn();
const mockDbClientQuery = jest.fn();
const mockDbClientRelease = jest.fn();
const mockGetClient = jest.fn();
const mockAuthorizeProjectAccess = jest.fn();
const mockCreateAgentSessionWithToken = jest.fn();
const mockInsertAgentMessageWithToken = jest.fn();
const mockGetStagedFileWithToken = jest.fn();
const mockGetRepoFileByPathWithToken = jest.fn();
const mockWriteBatch = jest.fn();
const mockReadCommitted = jest.fn();
const mockStagingBranchForWorkItem = jest.fn();

jest.mock("../../utils/rpcHelpers", () => ({
  stageFileChangeWithToken: mockStageFileChangeWithToken,
  batchStageFiles: mockBatchStageFiles,
  authorizeProjectAccess: mockAuthorizeProjectAccess,
  createAgentSessionWithToken: mockCreateAgentSessionWithToken,
  insertAgentMessageWithToken: mockInsertAgentMessageWithToken,
  getStagedFileWithToken: mockGetStagedFileWithToken,
  getRepoFileByPathWithToken: mockGetRepoFileByPathWithToken,
}));

jest.mock("../../services/versions/branchService", () => ({
  stagingBranchForWorkItem: (...args: unknown[]) => mockStagingBranchForWorkItem(...args),
}));

jest.mock("../../utils/repoBlobStore", () => ({
  getRepoBlobStore: jest.fn(() => ({
    writeStagedBatch: mockWriteBatch,
    readCommitted: mockReadCommitted,
  })),
}));

jest.mock("../../utils/database", () => ({
  __esModule: true,
  default: {
    query: mockDbQuery,
    getClient: mockGetClient,
  },
}));

jest.mock("../../config/aiModels", () => ({
  buildEndpointUrl: jest.fn(() => "https://example.test/openai/deployments/test/chat/completions"),
  getDefaultModel: jest.fn(() => ({ id: "test-model", deploymentName: "test-model" })),
  getModelConfig: jest.fn(() => ({ id: "test-model", deploymentName: "test-model" })),
}));

jest.mock("../../websocket", () => ({
  broadcast: mockBroadcast,
}));

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

beforeEach(() => {
  mockStageFileChangeWithToken.mockReset();
  mockBatchStageFiles.mockReset();
  mockBroadcast.mockReset();
  mockDbQuery.mockReset();
  mockDbClientQuery.mockReset();
  mockDbClientRelease.mockReset();
  mockGetClient.mockReset();
  mockAuthorizeProjectAccess.mockReset();
  mockCreateAgentSessionWithToken.mockReset();
  mockInsertAgentMessageWithToken.mockReset();
  mockGetStagedFileWithToken.mockReset();
  mockGetRepoFileByPathWithToken.mockReset();
  mockWriteBatch.mockReset();
  mockReadCommitted.mockReset();
  mockStagingBranchForWorkItem.mockReset();

  mockStageFileChangeWithToken.mockResolvedValue({ id: "stage-1" });
  mockBatchStageFiles.mockResolvedValue({ staged_count: 1, files: ["src/example.ts"] });
  mockAuthorizeProjectAccess.mockResolvedValue("editor");
  mockCreateAgentSessionWithToken.mockResolvedValue({ id: "session-1" });
  mockInsertAgentMessageWithToken.mockResolvedValue({ id: "message-1" });
  mockGetStagedFileWithToken.mockResolvedValue(null);
  mockGetRepoFileByPathWithToken.mockResolvedValue({ id: "file-1", path: "src/example.ts" });
  mockReadCommitted.mockResolvedValue(["one", "two", "three", "four", "five"].join("\n"));
  mockWriteBatch.mockResolvedValue(undefined);
  mockDbQuery.mockResolvedValue({ rows: [{ id: "operation-1" }] });
  mockGetClient.mockResolvedValue({ query: mockDbClientQuery, release: mockDbClientRelease });
  global.fetch = jest.fn();
});

import functionsRouter from "../../routes/functions";

const app = express();
app.use(express.json());
app.use("/functions", functionsRouter);

const createOperation = (path: string) => ({
  type: "create_file",
  params: { path, content: `content for ${path}` },
});

const streamingAiResponse = (payload: Record<string, unknown>) => {
  const encoder = new TextEncoder();
  const chunk = encoder.encode(
    `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(payload) } }] })}\n\ndata: [DONE]\n\n`,
  );
  let sent = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: chunk };
        },
        releaseLock: jest.fn(),
      }),
    },
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    text: async () => "",
  };
};

const invokeCodingAgent = async (workItemId?: string) => {
  (global.fetch as jest.Mock).mockResolvedValueOnce(
    streamingAiResponse({
      reasoning: "characterization test",
      operations: [createOperation("src/one.ts"), createOperation("src/two.ts")],
      status: "completed",
    }),
  );

  return request(app)
    .post("/functions/coding-agent-orchestrator")
    .send({
      projectId: "project-1",
      repoId: "repo-1",
      taskDescription: "characterize AI staging",
      selectedModel: "test-model",
      maxIterations: 1,
      ...(workItemId ? { workItemId } : {}),
    });
};

describe("coding-agent-orchestrator workItemId -> branch resolution", () => {
  it("stages files on the change's branch when workItemId is given", async () => {
    mockStagingBranchForWorkItem.mockResolvedValueOnce("feat/wi-1-thing");

    const response = await invokeCodingAgent("wi-1");

    expect(response.status).toBe(200);
    expect(mockStagingBranchForWorkItem).toHaveBeenCalledWith("wi-1");
    expect(mockBatchStageFiles).toHaveBeenCalledWith(
      "repo-1",
      null,
      [
        expect.objectContaining({ filePath: "src/one.ts", branch: "feat/wi-1-thing" }),
        expect.objectContaining({ filePath: "src/two.ts", branch: "feat/wi-1-thing" }),
      ],
      "project-1",
    );
  });

  it("does not resolve a branch, and omits it from staged files, without a workItemId", async () => {
    const response = await invokeCodingAgent();

    expect(response.status).toBe(200);
    expect(mockStagingBranchForWorkItem).not.toHaveBeenCalled();
    const [, , files] = mockBatchStageFiles.mock.calls[0];
    expect(files.every((f: Record<string, unknown>) => !("branch" in f))).toBe(true);
  });

  it("never fails the run when branch resolution throws — falls back to legacy (no branch)", async () => {
    mockStagingBranchForWorkItem.mockRejectedValueOnce(new Error("db down"));

    const response = await invokeCodingAgent("wi-1");

    expect(response.status).toBe(200);
    const [, , files] = mockBatchStageFiles.mock.calls[0];
    expect(files.every((f: Record<string, unknown>) => !("branch" in f))).toBe(true);
  });
});
