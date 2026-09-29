import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, screen, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SandboxStep } from "../steps/SandboxStep";
import { OutputStep } from "../steps/OutputStep";
import { PullRequestsStep } from "../steps/PullRequestsStep";
import { makeRepo, makeRun } from "./fixtures";
import { __resetLongTasksForTests, useLongTasks } from "@/lib/state/useLongTask";

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...a: unknown[]) => getMock(...a), post: (...a: unknown[]) => postMock(...a) },
}));
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    channel: () => {
      const c: Record<string, unknown> = {};
      c.on = () => c;
      c.subscribe = () => c;
      return c;
    },
    removeChannel: vi.fn(),
  },
}));

function renderWith(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  __resetLongTasksForTests();
});

describe("SandboxStep", () => {
  it("shows the final log blob for a finished run and a labelled log region", () => {
    renderWith(<SandboxStep run={makeRun({ status: "ready", log_blob: "cloned\ndetected node" })} onContinue={vi.fn()} onStartOver={vi.fn()} />);
    const log = screen.getByRole("log", { name: /sandbox log/i });
    expect(log).toHaveTextContent("cloned");
    expect(log).toHaveTextContent("detected node");
    expect(screen.getByText("Sandbox finished")).toBeInTheDocument();
  });

  it("registers a running run with the long-task pill and waits for output", () => {
    renderWith(<SandboxStep run={makeRun({ status: "running" })} onContinue={vi.fn()} onStartOver={vi.fn()} />);
    expect(screen.getByText("Sandbox is running")).toBeInTheDocument();
    expect(screen.getByText(/waiting for the sandbox/i)).toBeInTheDocument();
    const { result } = renderHook(() => useLongTasks());
    expect(result.current.find((t) => t.id === "onboarding-run1")).toMatchObject({ status: "running", channel: "onboarding-run1" });
  });

  it("settles the long task as failed when the run is cancelled", () => {
    const { rerender } = renderWith(<SandboxStep run={makeRun({ status: "running" })} onContinue={vi.fn()} onStartOver={vi.fn()} />);
    const tasks = renderHook(() => useLongTasks());
    expect(tasks.result.current.find((t) => t.id === "onboarding-run1")?.status).toBe("running");
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SandboxStep run={makeRun({ status: "cancelled" })} onContinue={vi.fn()} onStartOver={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(tasks.result.current.find((t) => t.id === "onboarding-run1")?.status).toBe("failed");
  });

  it("offers start over when the job failed", () => {
    renderWith(<SandboxStep run={makeRun({ status: "failed" })} onContinue={vi.fn()} onStartOver={vi.fn()} />);
    expect(screen.getByText("The sandbox run failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start over" })).toBeInTheDocument();
  });
});

describe("OutputStep", () => {
  it("lists detection, baseline counts, generated files and a per-repo sandbox failure", async () => {
    getMock.mockResolvedValueOnce(
      makeRun({
        status: "ready",
        repositories: [
          makeRepo(),
          makeRepo({ id: "r2", full_name: "e2e-goa/broken", generated_manifest: [], review: { sandboxError: "clone failed" } }),
        ],
      }),
    );
    renderWith(<OutputStep runId="run1" onContinue={vi.fn()} />);
    expect(await screen.findByText("e2e-goa/api")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
    expect(screen.getByText("3 green")).toBeInTheDocument();
    expect(screen.getByText(".github/workflows/mesh.yml")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("clone failed");
    expect(screen.getByText(/1 of 2 repositories/)).toBeInTheDocument();
  });

  it("shows a clean error when the output isn't available", async () => {
    getMock.mockRejectedValueOnce({ statusCode: 409, message: "Output is not available while the run is running" });
    renderWith(<OutputStep runId="run1" onContinue={vi.fn()} />);
    expect(await screen.findByText("Couldn't load the output")).toBeInTheDocument();
  });
});

describe("PullRequestsStep", () => {
  it("shows opened PRs, warnings and a link to the application", async () => {
    getMock.mockResolvedValueOnce(
      makeRun({
        status: "prs_open",
        application_id: "app1",
        warnings: ["e2e-goa/other: already onboarded to another application; not registered under this one"],
        repositories: [makeRepo({ pr_number: 42, pr_state: "open" })],
      }),
    );
    renderWith(<PullRequestsStep runId="run1" teamId="t1" />);
    expect(await screen.findByText("PR #42 · open")).toBeInTheDocument();
    expect(screen.getByText(/already onboarded to another application/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View application" })).toHaveAttribute("href", "/assurance/t/t1/apps/app1");
    expect(screen.getByText("Pull requests opened")).toBeInTheDocument();
  });
});

describe("useOnboardingRunTracker", () => {
  it("keeps polling a running task after the wizard unmounts and settles it when the run is ready", async () => {
    const { useOnboardingRunTracker } = await import("../useOnboardingRunTracker");
    const { startLongTask } = await import("@/lib/state/useLongTask");
    act(() => {
      startLongTask({ id: "onboarding-run1", label: "Sandbox", channel: "onboarding-run1" });
    });
    getMock.mockResolvedValue(makeRun({ status: "ready" }));
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    renderHook(() => useOnboardingRunTracker(), { wrapper });
    const tasks = renderHook(() => useLongTasks());
    await waitFor(() => expect(tasks.result.current.find((t) => t.id === "onboarding-run1")?.status).toBe("done"));
  });

  it("settles as failed when the run was cancelled", async () => {
    const { useOnboardingRunTracker } = await import("../useOnboardingRunTracker");
    const { startLongTask } = await import("@/lib/state/useLongTask");
    act(() => {
      startLongTask({ id: "onboarding-run1", label: "Sandbox" });
    });
    getMock.mockResolvedValue(makeRun({ status: "cancelled" }));
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    renderHook(() => useOnboardingRunTracker(), { wrapper });
    const tasks = renderHook(() => useLongTasks());
    await waitFor(() => expect(tasks.result.current.find((t) => t.id === "onboarding-run1")?.status).toBe("failed"));
  });
});
