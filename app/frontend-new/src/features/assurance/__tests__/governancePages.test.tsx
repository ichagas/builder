import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Packs } from "@/pages/assurance/Packs";
import { Policy } from "@/pages/assurance/Policy";
import { triggerUndo, dismissUndo } from "@/lib/state/useUndo";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

const orgRows = vi.fn();
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    from: () => ({ select: () => ({ limit: () => orgRows() }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: vi.fn(),
  },
}));

const useAdminMock = vi.fn();
vi.mock("@/contexts/AdminContext", () => ({ useAdmin: () => useAdminMock() }));

const getMock = vi.fn();
const putMock = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  default: { get: (...a: unknown[]) => getMock(...a), put: (...a: unknown[]) => putMock(...a) },
}));

const TEAM = "team-1";
const APP = "app-1";
const ORG = "org-1";

function policyBody(effective: Record<string, string>) {
  return { scope: "team", scopeId: TEAM, effective, cyberRiskSandbox: false, explicit: [] };
}

function route(url: string) {
  if (url === "/api/v1/teams/mine") return [{ id: TEAM, name: "Permits Platform", organization_id: ORG, role: "owner" }];
  if (url === "/api/v1/teams") return [{ id: TEAM, name: "Permits Platform", organization_id: ORG, member_count: 1, application_count: 1 }];
  if (url === `/api/v1/teams/${TEAM}/portfolio`)
    return {
      teamId: TEAM,
      applications: [
        {
          id: APP,
          name: "Permits API",
          owner_label: null,
          onboarded_at: null,
          repository_count: 2,
          not_reporting_count: 0,
          repositories: [
            { id: "r1", provider: "github", full_name: "e2e/api", default_branch: "main", ci_provider: null, profile: null, stack_label: null, part: null, pinned_pack: "2026.2", update_pr_number: null, update_pr_state: null, last_report_at: null, not_reporting: false },
            { id: "r2", provider: "github", full_name: "e2e/worker", default_branch: "main", ci_provider: null, profile: null, stack_label: null, part: null, pinned_pack: "2026.1", update_pr_number: null, update_pr_state: null, last_report_at: null, not_reporting: false },
          ],
        },
      ],
      totals: { applications: 1, repositories: 2, notReporting: 0 },
    };
  if (url === "/api/v1/packs")
    return [
      { version: "2026.2", published_at: "2026-09-01T00:00:00Z", notes: "Latest notes", changes: [["New", "Secrets scan"]], workflow_ref: null },
      { version: "2026.1", published_at: "2026-08-01T00:00:00Z", notes: null, changes: null, workflow_ref: null },
    ];
  if (url.startsWith("/api/v1/mesh/policy")) return policyBody({ green: "issue", yellow: "issue", red: "block", blue: "issue" });
  if (url.startsWith("/api/v1/mesh/exceptions"))
    return [
      { id: "e1", repository_id: "r1", rule: "Red recon", reason: "Batch job", approved_by: null, expires_at: "2099-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
      { id: "e2", repository_id: "r2", rule: "Green scan", reason: null, approved_by: null, expires_at: "2020-01-01T00:00:00Z", created_at: "2019-01-01T00:00:00Z" },
    ];
  throw new Error(`unexpected GET ${url}`);
}

function renderAt(ui: React.ReactElement, url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMock.mockReset().mockImplementation(async (url: string) => route(url));
  putMock.mockReset().mockResolvedValue(policyBody({ green: "issue", yellow: "issue", red: "block", blue: "issue" }));
  toastError.mockReset();
  dismissUndo();
  orgRows.mockReset().mockResolvedValue({ data: [{ id: "org-fallback" }] });
  useAdminMock.mockReset().mockReturnValue({ isAdmin: false, loading: false });
});

describe("Packs", () => {
  it("lists packs newest first with the team's adoption counts and change chips", async () => {
    renderAt(<Packs />, "/assurance/packs");
    const cards = await screen.findAllByTestId("governance-pack-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("2026.2");
    expect(cards[0]).toHaveTextContent("Latest pack");
    expect(cards[0]).toHaveTextContent("1 repo");
    expect(cards[0]).toHaveTextContent("Secrets scan");
    expect(cards[1]).toHaveTextContent("Standards pack");
  });
});

describe("Policy", () => {
  it("disables looser options for a team owner and applies a tightening", async () => {
    const user = userEvent.setup();
    renderAt(<Policy />, "/assurance/policy");
    const green = await screen.findByRole("combobox", { name: "Green policy mode" });
    const options = Array.from((green as HTMLSelectElement).options);
    expect(options.find((o) => o.value === "notify")?.disabled).toBe(true);
    expect(options.find((o) => o.value === "block")?.disabled).toBe(false);

    await user.selectOptions(green, "block");
    await user.click(screen.getByRole("button", { name: "Apply Green" }));
    await waitFor(() => expect(putMock).toHaveBeenCalledWith(`/api/v1/mesh/policy?scope=team&scopeId=${TEAM}`, { agent: "green", mode: "block" }));
  });

  it("lets an organization admin loosen, behind a confirmation", async () => {
    useAdminMock.mockReturnValue({ isAdmin: true, loading: false });
    const user = userEvent.setup();
    renderAt(<Policy />, "/assurance/policy");
    const red = await screen.findByRole("combobox", { name: "Red policy mode" });
    await user.selectOptions(red, "off");
    await user.click(screen.getByRole("button", { name: "Apply Red" }));
    expect(putMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Loosen Red/ }));
    await waitFor(() => expect(putMock).toHaveBeenCalledWith(`/api/v1/mesh/policy?scope=organization&scopeId=${ORG}`, { agent: "red", mode: "off" }));
  });

  it("surfaces an error when the undo write fails", async () => {
    useAdminMock.mockReturnValue({ isAdmin: true, loading: false });
    const user = userEvent.setup();
    renderAt(<Policy />, "/assurance/policy");
    const green = await screen.findByRole("combobox", { name: "Green policy mode" });
    await user.selectOptions(green, "block");
    await user.click(screen.getByRole("button", { name: "Apply Green" }));
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1));
    putMock.mockRejectedValueOnce(new Error("403"));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Green policy mode" })).toBeInTheDocument());
    triggerUndo();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't undo the change to Green"));
  });

  it("finds the organization for an admin with no teams", async () => {
    useAdminMock.mockReturnValue({ isAdmin: true, loading: false });
    getMock.mockImplementation(async (url: string) => {
      if (url === "/api/v1/teams/mine" || url === "/api/v1/teams") return [];
      return route(url);
    });
    renderAt(<Policy />, "/assurance/policy");
    await screen.findByRole("combobox", { name: "Red policy mode" });
    expect(getMock).toHaveBeenCalledWith("/api/v1/mesh/policy?scope=organization&scopeId=org-fallback");
  });

  it("lists exceptions with an expired marker and links to the application page", async () => {
    renderAt(<Policy />, "/assurance/policy?tab=exceptions");
    const rows = await screen.findAllByTestId("governance-exception-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("e2e/api");
    expect(rows[1]).toHaveTextContent(/expired/);
    expect(screen.getByRole("link", { name: "Request an exception" })).toHaveAttribute("href", `/assurance/t/${TEAM}/apps/${APP}`);
  });
});
