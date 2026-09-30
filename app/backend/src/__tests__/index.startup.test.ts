const initBlobStagingStoreMock = jest.fn();
const runMigrationsMock = jest.fn();
const listenMock = jest.fn();
const serverCloseMock = jest.fn();
const initWebSocketMock = jest.fn();

jest.mock("../utils/repoBlobStore", () => ({
    initRepoBlobStore: initBlobStagingStoreMock,
}));

jest.mock("../migrate", () => ({
    runMigrations: runMigrationsMock,
}));

jest.mock("../utils/logger", () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    },
}));

jest.mock("../websocket", () => ({
    initWebSocket: initWebSocketMock,
    getWsStats: jest.fn(() => ({ clients: 0 })),
}));

jest.mock("../swagger", () => ({
    swaggerSpec: {},
    getOpenApiSpec: jest.fn(() => ({})),
}));

jest.mock("../routes/v1", () => jest.fn());
jest.mock("../routes/health", () => jest.fn());
jest.mock("../routes/migrate", () => jest.fn());
jest.mock("swagger-ui-express", () => ({ serve: jest.fn(), setup: jest.fn(() => jest.fn()) }));
jest.mock("cors", () => jest.fn(() => jest.fn()));
jest.mock("helmet", () => jest.fn(() => jest.fn()));

jest.mock("express", () => {
    const app = {
        use: jest.fn(),
        get: jest.fn(),
        listen: listenMock,
    };
    const expressMock = jest.fn(() => app);
    Object.assign(expressMock, {
        json: jest.fn(() => jest.fn()),
        urlencoded: jest.fn(() => jest.fn()),
    });
    return expressMock;
});

import { startServer } from "../index";
import { logger } from "../utils/logger";
import { getJobDispatcher, InMemoryJobDispatcher, FailClosedJobDispatcher } from "../services/onboarding/jobDispatcher";

describe("API startup blob staging initialization", () => {
    beforeEach(() => {
        initBlobStagingStoreMock.mockReset();
        runMigrationsMock.mockReset().mockResolvedValue(undefined);
        initWebSocketMock.mockReset().mockReturnValue({ close: jest.fn() });
        serverCloseMock.mockReset();
        listenMock.mockReset().mockImplementation((_port, callback) => {
            callback();
            return { close: serverCloseMock };
        });
    });

    it("initializes BlobStagingStore before accepting traffic", async () => {
        await startServer();

        expect(initBlobStagingStoreMock).toHaveBeenCalledTimes(1);
        expect(initBlobStagingStoreMock.mock.invocationCallOrder[0]).toBeLessThan(runMigrationsMock.mock.invocationCallOrder[0]);
        expect(listenMock).toHaveBeenCalledTimes(1);
    });

    it("fails fast when BlobStagingStore initialization fails", async () => {
        initBlobStagingStoreMock.mockImplementationOnce(() => {
            throw new Error("storage unavailable");
        });

        await expect(startServer()).rejects.toThrow("storage unavailable");
        expect(listenMock).not.toHaveBeenCalled();
    });
});

describe("onboarding job dispatcher startup wiring (WP-BE6, T141)", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        initBlobStagingStoreMock.mockReset();
        runMigrationsMock.mockReset().mockResolvedValue(undefined);
        initWebSocketMock.mockReset().mockReturnValue({ close: jest.fn() });
        serverCloseMock.mockReset();
        listenMock.mockReset().mockImplementation((_port: number, callback: () => void) => {
            callback();
            return { close: serverCloseMock };
        });
        process.env = { ...ORIGINAL_ENV };
        delete process.env.ONBOARDING_JOB_DISPATCHER;
        delete process.env.ONBOARDING_JOB_SUBSCRIPTION_ID;
        delete process.env.ONBOARDING_JOB_RESOURCE_GROUP;
        delete process.env.ONBOARDING_JOB_NAME;
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it("defaults to InMemoryJobDispatcher and still boots when unconfigured outside production", async () => {
        process.env.NODE_ENV = "test";
        await startServer();
        expect(getJobDispatcher()).toBeInstanceOf(InMemoryJobDispatcher);
        expect(listenMock).toHaveBeenCalledTimes(1);
    });

    it("never crashes startup when production is misconfigured — installs a fail-closed dispatcher instead", async () => {
        process.env.NODE_ENV = "production";
        await startServer();
        expect(getJobDispatcher()).toBeInstanceOf(FailClosedJobDispatcher);
        expect(listenMock).toHaveBeenCalledTimes(1);
        await expect(getJobDispatcher().dispatch({ runId: "r1", teamId: "t1", repositories: [] } as any, jest.fn())).rejects.toMatchObject({
            statusCode: 503,
        });
    });
});

describe("local auth mode startup (AUTH_MODE=local)", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        initBlobStagingStoreMock.mockReset();
        runMigrationsMock.mockReset().mockResolvedValue(undefined);
        initWebSocketMock.mockReset().mockReturnValue({ close: jest.fn() });
        listenMock.mockReset().mockImplementation((_port: number, callback: () => void) => {
            callback();
            return { close: serverCloseMock };
        });
        (logger.warn as jest.Mock).mockClear();
        (logger.info as jest.Mock).mockClear();
        process.env = {
            ...ORIGINAL_ENV,
            AUTH_MODE: "local",
            NODE_ENV: "development",
            JWT_SECRET: "a".repeat(64),
            POSTGRES_HOST: "localhost",
        };
        delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
    });
    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it("skips blob store init (with a WARN) when no storage account is set, and logs the mode", async () => {
        await startServer();
        expect(initBlobStagingStoreMock).not.toHaveBeenCalled();
        expect(listenMock).toHaveBeenCalledTimes(1);
        expect((logger.warn as jest.Mock).mock.calls.flat().join("\n")).toMatch(/AZURE_STORAGE_ACCOUNT_NAME/);
        expect((logger.info as jest.Mock).mock.calls.flat().join("\n")).toMatch(/Auth mode: local/);
    });

    it("still initialises blob storage when an account name is set", async () => {
        process.env.AZURE_STORAGE_ACCOUNT_NAME = "repofilesaccount";
        await startServer();
        expect(initBlobStagingStoreMock).toHaveBeenCalledTimes(1);
    });

    it("warns when POSTGRES_HOST is not local", async () => {
        process.env.POSTGRES_HOST = "pg-shared.postgres.database.azure.com";
        await startServer();
        expect((logger.warn as jest.Mock).mock.calls.flat().join("\n")).toMatch(/POSTGRES_HOST/);
    });

    it("refuses to start without NODE_ENV=development|test", async () => {
        delete process.env.NODE_ENV;
        await expect(startServer()).rejects.toThrow(/NODE_ENV/);
        expect(listenMock).not.toHaveBeenCalled();
    });

    it("keeps Entra-mode fail-fast on blob init", async () => {
        delete process.env.AUTH_MODE;
        initBlobStagingStoreMock.mockImplementationOnce(() => {
            throw new Error("AZURE_STORAGE_ACCOUNT_NAME is required");
        });
        await expect(startServer()).rejects.toThrow("AZURE_STORAGE_ACCOUNT_NAME is required");
    });
});
