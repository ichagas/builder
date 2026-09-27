/**
 * Unit tests for the real dispatchers added by WP-BE6 (T141):
 * AzureContainerAppsJobDispatcher (mocked ARM REST + credential resolution),
 * LocalJobDispatcher (fixture-backed SandboxRunner, no docker/network), and
 * createJobDispatcherFromEnv's fail-closed selection.
 */
import { logger } from "../../../utils/logger";

jest.mock("../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../../utils/azureCredential", () => ({
  getAzureTokenForScope: jest.fn(async () => "arm-token"),
  AzureScope: { ARM: "https://management.azure.com/.default" },
}));

const mockResolveCloneCredential = jest.fn();
jest.mock("../../../services/onboarding/sandbox/credentials", () => ({
  resolveCloneCredential: (...args: unknown[]) => mockResolveCloneCredential(...args),
}));

const mockCreateSandboxSecret = jest.fn();
const mockDeleteSandboxSecret = jest.fn(async (..._args: unknown[]) => {});
const mockCleanupSandboxSecrets = jest.fn(async (..._args: unknown[]) => {});
jest.mock("../../../services/onboarding/sandbox/sandboxSecretStore", () => ({
  getSandboxSecretStore: () => ({
    createSecret: (...args: unknown[]) => mockCreateSandboxSecret(...args),
    getSecret: jest.fn(),
    deleteSecret: (...args: unknown[]) => mockDeleteSandboxSecret(...args),
  }),
  cleanupSandboxSecrets: (...args: unknown[]) => mockCleanupSandboxSecrets(...args),
}));

import {
  AzureContainerAppsJobDispatcher,
  LocalJobDispatcher,
  SandboxRunner,
  createJobDispatcherFromEnv,
  JobDispatcherConfigurationError,
  InMemoryJobDispatcher,
  JobRepoResult,
} from "../../../services/onboarding/jobDispatcher";

describe("AzureContainerAppsJobDispatcher", () => {
  const config = {
    subscriptionId: "sub-1",
    resourceGroup: "rg-1",
    jobName: "onboarding-sandbox",
    sandboxVaultUrl: "https://kv-onboarding-sandbox.vault.azure.net",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveCloneCredential.mockResolvedValue({
      provider: "github",
      cloneUrl: "https://github.com/goa/permits-api.git",
      authorizationHeader: "Basic super-secret-should-never-appear-in-a-log",
    });
    mockCreateSandboxSecret.mockImplementation(async (prefix: string) => `${prefix}-secret-name`);
  });

  afterEach(() => {
    (global as any).fetch = undefined;
  });

  it("starts a job execution and resolves the execution id from the async operation location", async () => {
    const fetchMock = jest
      .fn()
      // POST .../start
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: new Map([["location", "https://management.azure.com/op/1"]]) as any,
        text: async () => "",
      })
      // GET the operation location
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ name: "exec-123" }) });
    (fetchMock.mock.results as any); // no-op, keeps TS happy about usage
    (global as any).fetch = fetchMock;

    // token = base64url(payload).base64url(signature) — only the payload
    // half is non-secret; the dispatcher must never send the whole thing.
    const callbackToken = "cGF5bG9hZA.c2lnbmF0dXJl";

    const dispatcher = new AzureContainerAppsJobDispatcher(config);
    const result = await dispatcher.dispatch(
      {
        runId: "run-1",
        teamId: "team-1",
        organizationId: "org-1",
        connectionId: null,
        packVersion: "2026.3",
        repositories: [{ fullName: "goa/permits-api" }],
        callbackUrl: "https://api.pronghorn.example/api/v1/onboarding/runs/run-1/callback",
        callbackToken,
        callbackSecretRef: "callback-key-secret-name",
      },
      jest.fn()
    );

    expect(result.jobExecutionId).toBe("exec-123");
    expect(result.sandboxSecretNames).toEqual(["repo-auth-secret-name"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Fix round 1, item 1: the per-repo credential was written to the
    // sandbox vault (with a TTL), never sent to ARM at all.
    expect(mockCreateSandboxSecret).toHaveBeenCalledWith(
      "repo-auth",
      "Basic super-secret-should-never-appear-in-a-log",
      expect.any(Number)
    );

    const startCall = fetchMock.mock.calls[0];
    expect(String(startCall[0])).toContain("/jobs/onboarding-sandbox/start");
    const body = JSON.parse((startCall[1] as any).body);

    // The Jobs "start" REST body is a JobExecutionTemplate — no
    // `configuration`/`secrets` block exists on it at all (it would be
    // silently dropped if present), and the raw JSON must contain no secret
    // value anywhere.
    expect(body.configuration).toBeUndefined();
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain("super-secret-should-never-appear-in-a-log");
    expect(bodyText).not.toContain(callbackToken);

    const env = body.template.containers[0].env;
    const envNames = env.map((e: any) => e.name);
    expect(envNames).toContain("PRONGHORN_RUN_ID");
    expect(envNames).toContain("PRONGHORN_VAULT_URI");
    expect(envNames).toContain("PRONGHORN_CALLBACK_PAYLOAD");
    expect(envNames).toContain("PRONGHORN_CALLBACK_KEY_SECRET_NAME");
    expect(envNames).toContain("PRONGHORN_REPO_AUTH_SECRET_NAME_0");
    expect(envNames).not.toContain("PRONGHORN_CALLBACK_TOKEN");
    expect(envNames).not.toContain("PRONGHORN_REPO_AUTH_0");

    expect(env.find((e: any) => e.name === "PRONGHORN_VAULT_URI").value).toBe(config.sandboxVaultUrl);
    expect(env.find((e: any) => e.name === "PRONGHORN_CALLBACK_KEY_SECRET_NAME").value).toBe("callback-key-secret-name");
    // Only the payload half of the token (not secret on its own) is sent.
    expect(env.find((e: any) => e.name === "PRONGHORN_CALLBACK_PAYLOAD").value).toBe("cGF5bG9hZA");
    expect(env.find((e: any) => e.name === "PRONGHORN_REPO_AUTH_SECRET_NAME_0").value).toBe("repo-auth-secret-name");

    // Never logged, in any log call.
    const allLogText = [...(logger.info as jest.Mock).mock.calls, ...(logger.warn as jest.Mock).mock.calls]
      .flat()
      .join(" ");
    expect(allLogText).not.toContain("super-secret-should-never-appear-in-a-log");
    expect(allLogText).not.toContain(callbackToken);
  });

  it("drops a repository whose clone credential can't be minted, logging why, without failing the whole dispatch", async () => {
    mockResolveCloneCredential.mockRejectedValueOnce(new Error("outside org scope"));
    const fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, status: 202, headers: new Map() as any, text: async () => "" });
    (global as any).fetch = fetchMock;

    const dispatcher = new AzureContainerAppsJobDispatcher(config);
    await dispatcher.dispatch(
      {
        runId: "run-1",
        teamId: "team-1",
        organizationId: "org-1",
        repositories: [{ fullName: "goa/permits-api" }],
      },
      jest.fn()
    );

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("could not mint a clone credential"));
    expect(mockCreateSandboxSecret).not.toHaveBeenCalled();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(JSON.parse(body.template.containers[0].env.find((e: any) => e.name === "PRONGHORN_REPOSITORIES").value)).toEqual([]);
  });

  it("throws when the start call fails outright, and cleans up the vault secrets it already wrote", async () => {
    (global as any).fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" });
    const dispatcher = new AzureContainerAppsJobDispatcher(config);
    await expect(
      dispatcher.dispatch(
        { runId: "run-1", teamId: "team-1", organizationId: "org-1", repositories: [{ fullName: "goa/permits-api" }] },
        jest.fn()
      )
    ).rejects.toThrow(/Could not start/);

    expect(mockCleanupSandboxSecrets).toHaveBeenCalledWith(["repo-auth-secret-name"]);
  });

  it("cleans up any vault secrets already written when the vault itself fails mid-loop", async () => {
    // The vault write (not credential resolution) fails on the second repo
    // — a systemic failure, not a per-repository scope issue, so it must
    // abort the whole dispatch rather than being silently dropped.
    mockResolveCloneCredential.mockReset();
    mockResolveCloneCredential
      .mockResolvedValueOnce({ provider: "github", cloneUrl: "https://github.com/a/a.git", authorizationHeader: "Basic a" })
      .mockResolvedValueOnce({ provider: "github", cloneUrl: "https://github.com/b/b.git", authorizationHeader: "Basic b" });
    mockCreateSandboxSecret
      .mockResolvedValueOnce("repo-auth-secret-name-1")
      .mockRejectedValueOnce(new Error("vault unreachable"));

    (global as any).fetch = jest.fn();
    const dispatcher = new AzureContainerAppsJobDispatcher(config);
    await expect(
      dispatcher.dispatch(
        { runId: "run-1", teamId: "team-1", organizationId: "org-1", repositories: [{ fullName: "a/a" }, { fullName: "b/b" }] },
        jest.fn()
      )
    ).rejects.toThrow(/vault unreachable/);

    expect(mockCleanupSandboxSecrets).toHaveBeenCalledWith(["repo-auth-secret-name-1"]);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it("cancel() calls the stop endpoint for a resolved execution id", async () => {
    (global as any).fetch = jest.fn().mockResolvedValueOnce({ ok: true, status: 202 });
    const dispatcher = new AzureContainerAppsJobDispatcher(config);
    await dispatcher.cancel("exec-123");
    expect((global as any).fetch).toHaveBeenCalledWith(expect.stringContaining("/executions/exec-123/stop"), expect.anything());
  });

  it("cancel() is a no-op for an execution id whose real name was never resolved", async () => {
    (global as any).fetch = jest.fn();
    const dispatcher = new AzureContainerAppsJobDispatcher(config);
    await dispatcher.cancel("azure-pending-run-1");
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});

describe("LocalJobDispatcher", () => {
  class FixtureSandboxRunner implements SandboxRunner {
    calls: string[] = [];
    async runRepository(input: { fullName: string }): Promise<JobRepoResult> {
      this.calls.push(input.fullName);
      return {
        fullName: input.fullName,
        detectedProfile: "node",
        detectedCi: "github_actions",
        generatedManifest: [{ path: ".github/workflows/assurance-mesh.yml", content: "# generated" }],
        baselineCounts: { green: 0, yellow: 0, red: 0, blue: 0 },
      };
    }
  }

  it("runs every repository through the injected runner and completes in-process", async () => {
    const runner = new FixtureSandboxRunner();
    const dispatcher = new LocalJobDispatcher(runner);
    const onComplete = jest.fn(async (_result: any) => {});
    const events: any[] = [];

    await dispatcher.dispatch(
      { runId: "run-1", teamId: "team-1", organizationId: "org-1", repositories: [{ fullName: "goa/a" }, { fullName: "adoOrg/proj/b" }] },
      onComplete,
      (e) => events.push(e)
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runner.calls).toEqual(["goa/a", "adoOrg/proj/b"]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0] as any;
    expect(result.status).toBe("ready");
    expect(result.repositories).toHaveLength(2);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("reports a failed result when the runner throws", async () => {
    const dispatcher = new LocalJobDispatcher({
      runRepository: async () => {
        throw new Error("clone failed");
      },
    });
    const onComplete = jest.fn(async (_result: any) => {});

    await dispatcher.dispatch({ runId: "run-1", teamId: "team-1", organizationId: "org-1", repositories: [{ fullName: "goa/a" }] }, onComplete);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error: "clone failed" }));
  });

  it("cancel() resolves without throwing (best-effort only)", async () => {
    await expect(new LocalJobDispatcher({ runRepository: jest.fn() }).cancel("local-run-1")).resolves.toBeUndefined();
  });
});

describe("createJobDispatcherFromEnv", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ONBOARDING_JOB_DISPATCHER;
    delete process.env.ONBOARDING_JOB_SUBSCRIPTION_ID;
    delete process.env.ONBOARDING_JOB_RESOURCE_GROUP;
    delete process.env.ONBOARDING_JOB_NAME;
    delete process.env.ONBOARDING_SANDBOX_KEYVAULT_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("builds an AzureContainerAppsJobDispatcher when fully configured", () => {
    process.env.ONBOARDING_JOB_DISPATCHER = "azure";
    process.env.ONBOARDING_JOB_SUBSCRIPTION_ID = "sub-1";
    process.env.ONBOARDING_JOB_RESOURCE_GROUP = "rg-1";
    process.env.ONBOARDING_JOB_NAME = "onboarding-sandbox";
    process.env.ONBOARDING_SANDBOX_KEYVAULT_URL = "https://kv-onboarding-sandbox.vault.azure.net";

    expect(createJobDispatcherFromEnv()).toBeInstanceOf(AzureContainerAppsJobDispatcher);
  });

  it("fails closed when azure is selected but not fully configured", () => {
    process.env.ONBOARDING_JOB_DISPATCHER = "azure";
    expect(() => createJobDispatcherFromEnv()).toThrow(JobDispatcherConfigurationError);
  });

  it("fails closed when azure is selected but the sandbox vault URL is missing", () => {
    process.env.ONBOARDING_JOB_DISPATCHER = "azure";
    process.env.ONBOARDING_JOB_SUBSCRIPTION_ID = "sub-1";
    process.env.ONBOARDING_JOB_RESOURCE_GROUP = "rg-1";
    process.env.ONBOARDING_JOB_NAME = "onboarding-sandbox";
    expect(() => createJobDispatcherFromEnv()).toThrow(JobDispatcherConfigurationError);
  });

  it("builds a LocalJobDispatcher when selected", () => {
    process.env.ONBOARDING_JOB_DISPATCHER = "local";
    expect(createJobDispatcherFromEnv()).toBeInstanceOf(LocalJobDispatcher);
  });

  it("builds an InMemoryJobDispatcher when explicitly selected as memory", () => {
    process.env.ONBOARDING_JOB_DISPATCHER = "memory";
    expect(createJobDispatcherFromEnv()).toBeInstanceOf(InMemoryJobDispatcher);
  });

  it("fails closed in production when nothing is configured", () => {
    process.env.NODE_ENV = "production";
    expect(() => createJobDispatcherFromEnv()).toThrow(JobDispatcherConfigurationError);
  });

  it("fails closed when NODE_ENV is unset, even without an explicit 'production' value", () => {
    delete process.env.NODE_ENV;
    expect(() => createJobDispatcherFromEnv()).toThrow(JobDispatcherConfigurationError);
  });

  it("defaults to InMemoryJobDispatcher in a non-production environment when unset", () => {
    process.env.NODE_ENV = "test";
    expect(createJobDispatcherFromEnv()).toBeInstanceOf(InMemoryJobDispatcher);
  });

  it("warns but allows memory in production (explicit opt-in, e.g. staging smoke tests)", () => {
    process.env.NODE_ENV = "production";
    process.env.ONBOARDING_JOB_DISPATCHER = "memory";
    expect(createJobDispatcherFromEnv()).toBeInstanceOf(InMemoryJobDispatcher);
    expect(logger.warn).toHaveBeenCalled();
  });
});
