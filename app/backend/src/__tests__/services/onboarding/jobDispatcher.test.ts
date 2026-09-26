/**
 * Unit tests for the in-memory job dispatcher default (spec 007, WP-BE5).
 */
import {
  InMemoryJobDispatcher,
  getJobDispatcher,
  setJobDispatcher,
  resetJobDispatcher,
  JobDispatcher,
} from "../../../services/onboarding/jobDispatcher";

describe("InMemoryJobDispatcher", () => {
  it("returns a job execution id synchronously and reports a ready result asynchronously", async () => {
    const dispatcher = new InMemoryJobDispatcher();
    let received: any = null;
    const onComplete = jest.fn(async (result) => {
      received = result;
    });

    const { jobExecutionId } = await dispatcher.dispatch(
      { runId: "run-1", teamId: "team-1", packVersion: "2026.3", repositories: [{ fullName: "goa/permits-api" }] },
      onComplete
    );

    expect(jobExecutionId).toContain("run-1");

    // Flush the microtask queue used to schedule the callback (it may run
    // before or shortly after dispatch()'s own promise settles).
    await Promise.resolve();
    await Promise.resolve();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(received.runId).toBe("run-1");
    expect(received.status).toBe("ready");
    expect(received.repositories).toHaveLength(1);
    expect(received.repositories[0].fullName).toBe("goa/permits-api");
    expect(received.repositories[0].generatedManifest.length).toBeGreaterThan(0);
  });

  it("cancel is a no-op that does not throw", async () => {
    const dispatcher = new InMemoryJobDispatcher();
    await expect(dispatcher.cancel("inmemory-run-1")).resolves.toBeUndefined();
  });
});

describe("dispatcher injection point", () => {
  afterEach(() => resetJobDispatcher());

  it("defaults to an InMemoryJobDispatcher", () => {
    expect(getJobDispatcher()).toBeInstanceOf(InMemoryJobDispatcher);
  });

  it("setJobDispatcher swaps the active dispatcher (e.g. WP-BE6's real one, or a test double)", () => {
    const fake: JobDispatcher = {
      dispatch: jest.fn(async () => ({ jobExecutionId: "fake-exec" })),
      cancel: jest.fn(async () => {}),
    };

    setJobDispatcher(fake);

    expect(getJobDispatcher()).toBe(fake);
  });

  it("resetJobDispatcher restores the default InMemoryJobDispatcher", () => {
    setJobDispatcher({ dispatch: jest.fn(), cancel: jest.fn() });
    resetJobDispatcher();
    expect(getJobDispatcher()).toBeInstanceOf(InMemoryJobDispatcher);
  });
});
