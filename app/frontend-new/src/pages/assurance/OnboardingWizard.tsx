import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shell/PageHeader";
import { Stepper, type Step } from "@/components/shell/Stepper";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { FilterChips } from "@/components/shell/FilterChips";
import { ActionButton } from "@/components/shell/ActionButton";
import { EmptyState } from "@/components/shell/atoms";
import { useUrlState } from "@/lib/state/useUrlState";
import { useTeamsMine, useTeamsAll } from "@/features/assurance/api";
import { useAdmin } from "@/contexts/AdminContext";
import {
  useOnboardingRun,
  useCreateOnboardingRun,
  useSetRunRepositories,
  useCancelOnboardingRun,
  useGitHubImportRepos,
  useAzureImportRepos,
  type ImportableGitHubRepository,
  type ImportableAzureRepository,
} from "@/features/onboarding/api";
import {
  usePublishOnboardingWizardPrimaryAction,
} from "./onboardingWizard.primaryAction";
import type { ApiError } from "@/lib/apiClient";

/**
 * OnboardingWizard (T150, WP-O1, NO-01/NO-02). Steps 1-2 of the five-step
 * "Onboard an app" wizard (data-model.md §3 `onboarding_runs.step`; see
 * `docs/design/frontend-redesign/option-a-styles/shared/onboard-b.js`
 * `onboardView()` for the prototype this follows):
 *
 *  1. **Team & app** ("team"): create the draft run. The team is fixed by
 *     the route (`/assurance/t/:teamId/onboard`) -- unlike the prototype's
 *     team `<select>`, onboarding here is always started from within a
 *     team's own portfolio, so this step only asks for the application
 *     name.
 *  2. **Connect repos** ("connect"): import from GitHub or Azure Repos
 *     (`GET /onboarding/{github,azure}/repos`, scoped server-side to the
 *     team's organization's configured connections -- contracts/api.md),
 *     pick which repositories belong to the app, and save the selection
 *     (`PUT .../repositories`). A repository outside the organization's
 *     scope is refused with 403; a case-insensitive duplicate in the same
 *     selection is refused with 422 (contracts/api.md, BE5 fix rounds 1/3)
 *     -- both surfaced here as a plain inline message, never the raw error.
 *
 * Steps 3-5 (run in sandbox, review output, open pull requests) and the
 * `onboarding-{runId}` realtime log are WP-O2 (T151); the Stepper disables
 * them until this run reaches "sandbox" and beyond, and the "connect" step
 * shows a lock-toned banner once a selection is saved instead of a dead
 * "Continue" button.
 *
 * The run id isn't part of the URL path (contracts/routes.md's
 * `/onboard/:step?` has no `:runId` slot -- onboarding is scoped to one
 * team at a time, and only one draft run is being built here), so it's
 * held in the `?run=` query param (useUrlState) alongside `step`, which is
 * the path segment itself.
 */
function buildOnboardPath(teamId: string, step: "team" | "connect"): string {
  return step === "team" ? `/assurance/t/${teamId}/onboard` : `/assurance/t/${teamId}/onboard/connect`;
}

/** Never echoes a raw/unexpected error; falls back to a generic message. */
function extractErrorMessage(error: unknown, fallback: string): string {
  const apiError = error as ApiError | undefined;
  if (!apiError) return fallback;
  const details = apiError.details as Record<string, unknown> | undefined;
  const detailMessage = details && typeof details.repositories === "string" ? details.repositories : undefined;
  if (detailMessage) return detailMessage;
  if (typeof apiError.message === "string" && apiError.message && apiError.statusCode !== 500) return apiError.message;
  return fallback;
}

interface RepoOption {
  fullName: string;
  disabledReason?: "archived" | "disabled";
}

function githubToOptions(repos: ImportableGitHubRepository[]): RepoOption[] {
  return repos.map((r) => ({ fullName: r.fullName, disabledReason: r.archived ? "archived" : undefined }));
}

function azureToOptions(repos: ImportableAzureRepository[]): RepoOption[] {
  return repos.map((r) => ({ fullName: r.fullName, disabledReason: r.disabled ? "disabled" : undefined }));
}

export function OnboardingWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { teamId = "", step: rawStep } = useParams<{ teamId: string; step?: string }>();
  const [searchParams] = useSearchParams();
  const [runId, setRunId] = useUrlState("run", "");
  const { isAdmin } = useAdmin();
  const { data: mine } = useTeamsMine();
  const { data: allTeams } = useTeamsAll(isAdmin);
  const team = React.useMemo(
    () => mine?.find((tm) => tm.id === teamId) ?? allTeams?.find((tm) => tm.id === teamId),
    [mine, allTeams, teamId],
  );

  const { data: run, isLoading: isRunLoading, isError: isRunError, error: runError } = useOnboardingRun(runId || undefined);

  // The URL's :step segment only ever selects between the two steps this WP
  // implements; anything else (a stale/typed-in "sandbox" etc.) falls back
  // to "connect" if a run already exists, or "team" otherwise -- see the
  // module docstring.
  const step: "team" | "connect" = run && rawStep && rawStep !== "team" ? "connect" : "team";

  const goToStep = React.useCallback(
    (target: "team" | "connect") => {
      if (target === "connect" && !run) return;
      const qs = searchParams.toString();
      navigate(`${buildOnboardPath(teamId, target)}${qs ? `?${qs}` : ""}`);
    },
    [navigate, run, searchParams, teamId],
  );

  const hasSelection = (run?.repositories.length ?? 0) > 0;
  const steps: Step[] = [
    { id: "team", label: t("onboarding.wizard.steps.team"), state: run ? "done" : "active" },
    { id: "connect", label: t("onboarding.wizard.steps.connect"), state: !run ? "todo" : hasSelection ? "done" : "active" },
    { id: "sandbox", label: t("onboarding.wizard.steps.sandbox"), state: "todo" },
    { id: "output", label: t("onboarding.wizard.steps.output"), state: "todo" },
    { id: "prs", label: t("onboarding.wizard.steps.prs"), state: "todo" },
  ];

  const cancelRun = useCancelOnboardingRun();
  const handleCancel = React.useCallback(async () => {
    if (!run) return;
    await cancelRun.mutateAsync(run.id);
    navigate(`/assurance/t/${teamId}`);
  }, [cancelRun, navigate, run, teamId]);

  const notFound = isRunError && (runError as ApiError | undefined)?.statusCode === 404;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        crumb={team ? t("onboarding.wizard.crumb", { team: team.name }) : t("onboarding.wizard.crumbFallback")}
        title={run?.application_name || t("onboarding.wizard.title")}
      />

      <Stepper steps={steps} current={step} onSelect={(id) => goToStep(id === "team" ? "team" : "connect")} />

      {runId && isRunLoading ? (
        <div role="status" className="p-9 text-center text-muted-foreground">
          {t("onboarding.wizard.loading")}
        </div>
      ) : notFound ? (
        <EmptyState title={t("onboarding.wizard.notFound.title")} description={t("onboarding.wizard.notFound.description")} />
      ) : runId && isRunError ? (
        <EmptyState title={t("onboarding.wizard.error.title")} description={t("onboarding.wizard.error.description")} />
      ) : (
        <>
          {step === "team" ? (
            <TeamStep teamId={teamId} teamName={team?.name} run={run} onCreated={(newRunId) => {
              setRunId(newRunId);
              goToStep("connect");
            }} />
          ) : (
            <ConnectStep teamId={teamId} run={run ?? null} />
          )}

          {run && run.status === "draft" ? (
            <div className="flex justify-end">
              <ActionButton
                label={t("onboarding.wizard.cancel.label")}
                tone="danger"
                confirm={t("onboarding.wizard.cancel.confirm")}
                onAction={handleCancel}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Team & app
// ---------------------------------------------------------------------------

function TeamStep({
  teamId,
  teamName,
  run,
  onCreated,
}: {
  teamId: string;
  teamName: string | undefined;
  run: ReturnType<typeof useOnboardingRun>["data"];
  onCreated: (runId: string) => void;
}) {
  const { t } = useTranslation();
  const [applicationName, setApplicationName] = React.useState("");
  const createRun = useCreateOnboardingRun();
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const trimmed = applicationName.trim();
  const canSubmit = !run && trimmed.length > 0 && !createRun.isPending;

  const submit = React.useCallback(async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    try {
      const created = await createRun.mutateAsync({ teamId, applicationName: trimmed });
      onCreated(created.id);
    } catch (error) {
      setSubmitError(extractErrorMessage(error, t("onboarding.wizard.team.error")));
    }
  }, [canSubmit, createRun, onCreated, t, teamId, trimmed]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  // FR-003: at most one primary action, through PageHeader (mirrored to the
  // mobile PrimaryActionSlot via PrimaryActionContext) -- no separate inline
  // "Continue" button here once a primary action is published.
  usePublishOnboardingWizardPrimaryAction(
    run ? undefined : { label: t("onboarding.wizard.continue"), onClick: submit, disabled: !canSubmit },
  );

  return (
    <section className="rounded-xs border border-line bg-surface">
      <NextStepBanner
        tone="info"
        title={t("onboarding.wizard.team.banner.title")}
        body={t("onboarding.wizard.team.banner.body", { team: teamName ?? "" })}
      />
      <form onSubmit={handleFormSubmit} className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("onboarding.wizard.team.teamLabel")}
          </span>
          <span className="text-sm font-semibold text-ink">{teamName ?? teamId}</span>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink" htmlFor="onboarding-app-name">
          {t("onboarding.wizard.team.appNameLabel")}
          <input
            id="onboarding-app-name"
            value={run ? run.application_name : applicationName}
            onChange={(e) => setApplicationName(e.target.value)}
            disabled={!!run}
            placeholder={t("onboarding.wizard.team.appNamePlaceholder")}
            className="h-10 rounded-xs border border-line bg-surface px-3 text-sm text-ink disabled:opacity-70"
          />
        </label>
        {submitError ? (
          <p role="alert" className="text-sm text-bad">
            {submitError}
          </p>
        ) : null}
        {run ? (
          <NextStepBanner
            tone="ok"
            title={t("onboarding.wizard.team.created.title")}
            body={t("onboarding.wizard.team.created.body")}
          />
        ) : null}
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Connect repos
// ---------------------------------------------------------------------------

function ConnectStep({ teamId, run }: { teamId: string; run: ReturnType<typeof useOnboardingRun>["data"] | null }) {
  const { t } = useTranslation();
  // FilterChips (below) owns writing this param; read the same key here so
  // the two stay in sync without duplicating state.
  const [source] = useUrlState("src", "github");
  const [query, setQuery] = useUrlState("q", "");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const lastSeededRunId = React.useRef<string | null>(null);

  // Seed local selection from the run's own saved state once per run --
  // never on every refetch, so it doesn't stomp a selection the user is
  // still editing (e.g. right after the mutation's own optimistic
  // setQueryData, this effect must not re-run and reset back to the same
  // set, which is harmless, but it also must not run on an unrelated
  // background refetch mid-edit).
  React.useEffect(() => {
    if (!run || lastSeededRunId.current === run.id) return;
    lastSeededRunId.current = run.id;
    setSelected(new Set(run.repositories.filter((r) => r.selected).map((r) => r.full_name)));
  }, [run]);

  const githubEnabled = source === "github";
  const azureEnabled = source === "azure";
  const github = useGitHubImportRepos(teamId, query, githubEnabled);
  const azure = useAzureImportRepos(teamId, query, azureEnabled);

  const options: RepoOption[] = githubEnabled ? githubToOptions(github.data ?? []) : azureToOptions(azure.data ?? []);
  const browseLoading = githubEnabled ? github.isLoading : azure.isLoading;
  const browseError = githubEnabled ? github.isError : azure.isError;
  const browseErrorObj = githubEnabled ? github.error : azure.error;

  const toggle = (fullName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  };

  const selectableVisible = options.filter((o) => !o.disabledReason);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((o) => selected.has(o.fullName));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        selectableVisible.forEach((o) => next.delete(o.fullName));
      } else {
        selectableVisible.forEach((o) => next.add(o.fullName));
      }
      return next;
    });
  };

  const setRepositories = useSetRunRepositories();
  const alreadySaved = (run?.repositories.length ?? 0) > 0;
  const canSave = !!run && selected.size > 0 && !setRepositories.isPending;

  const handleSave = React.useCallback(async () => {
    if (!run || !canSave) return;
    setSubmitError(null);
    try {
      await setRepositories.mutateAsync({ runId: run.id, fullNames: Array.from(selected) });
    } catch (error) {
      setSubmitError(extractErrorMessage(error, t("onboarding.wizard.connect.error")));
    }
  }, [canSave, run, selected, setRepositories, t]);

  usePublishOnboardingWizardPrimaryAction(
    run ? { label: t("onboarding.wizard.connect.save"), onClick: handleSave, disabled: !canSave } : undefined,
  );

  if (!run) {
    return <EmptyState title={t("onboarding.wizard.connect.noRun.title")} description={t("onboarding.wizard.connect.noRun.description")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <NextStepBanner
        tone="info"
        title={t("onboarding.wizard.connect.banner.title")}
        body={t("onboarding.wizard.connect.banner.body")}
      />

      <section className="rounded-xs border border-line bg-surface" data-testid="onboarding-selected-repos">
        <div className="flex items-center justify-between px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">{t("onboarding.wizard.connect.selectedHeading")}</h2>
          <span className="text-xs text-muted-foreground">{t("onboarding.wizard.connect.selectedCount", { count: selected.size })}</span>
        </div>
        {selected.size === 0 ? (
          <EmptyState size="small" title={t("onboarding.wizard.connect.selectedEmpty")} />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {Array.from(selected)
              .sort()
              .map((fullName) => (
                <li key={fullName} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <code className="truncate text-ink">{fullName}</code>
                  <button
                    type="button"
                    onClick={() => toggle(fullName)}
                    aria-label={t("onboarding.wizard.connect.remove", { name: fullName })}
                    className="shrink-0 text-xs font-medium text-muted-foreground hover:text-ink"
                  >
                    {t("onboarding.wizard.connect.removeShort")}
                  </button>
                </li>
              ))}
          </ul>
        )}
        {submitError ? (
          <p role="alert" className="px-4 pb-3 text-sm text-bad">
            {submitError}
          </p>
        ) : null}
      </section>

      {alreadySaved ? (
        <NextStepBanner
          tone="lock"
          title={t("onboarding.wizard.comingSoon.title")}
          body={t("onboarding.wizard.comingSoon.body")}
        />
      ) : null}

      <section className="rounded-xs border border-line bg-surface" data-testid="onboarding-import-list">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">{t("onboarding.wizard.connect.browseHeading")}</h2>
          <FilterChips
            paramKey="src"
            defaultValue="github"
            options={[
              { id: "github", label: t("onboarding.wizard.connect.source.github") },
              { id: "azure", label: t("onboarding.wizard.connect.source.azure") },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("onboarding.wizard.connect.searchPlaceholder")}
            aria-label={t("onboarding.wizard.connect.searchPlaceholder")}
            className="h-9 flex-1 rounded-xs border border-line bg-surface px-3 text-sm text-ink"
          />
          <button
            type="button"
            onClick={toggleAll}
            disabled={selectableVisible.length === 0}
            className="h-9 rounded-xs border border-line bg-surface px-3 text-xs font-semibold text-ink disabled:opacity-50"
          >
            {allVisibleSelected ? t("onboarding.wizard.connect.clearAll") : t("onboarding.wizard.connect.selectAll")}
          </button>
        </div>

        {browseLoading ? (
          <div role="status" className="p-6 text-center text-sm text-muted-foreground">
            {t("onboarding.wizard.connect.browseLoading")}
          </div>
        ) : browseError ? (
          <EmptyState
            size="small"
            title={t("onboarding.wizard.connect.browseError.title")}
            description={extractErrorMessage(browseErrorObj, t("onboarding.wizard.connect.browseError.description"))}
          />
        ) : options.length === 0 ? (
          <EmptyState size="small" title={t("onboarding.wizard.connect.browseEmpty.title")} description={t("onboarding.wizard.connect.browseEmpty.description")} />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {options.map((option) => (
              <li key={option.fullName} className="flex items-center gap-3 px-4 py-2 text-sm">
                <input
                  type="checkbox"
                  id={`repo-${option.fullName}`}
                  checked={selected.has(option.fullName)}
                  disabled={!!option.disabledReason}
                  onChange={() => toggle(option.fullName)}
                  className="h-[18px] w-[18px]"
                />
                <label htmlFor={`repo-${option.fullName}`} className="min-w-0 flex-1 truncate text-ink">
                  <code>{option.fullName}</code>
                </label>
                {option.disabledReason ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t(`onboarding.wizard.connect.${option.disabledReason}`)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default OnboardingWizard;
