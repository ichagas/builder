import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { EmptyState, PrChip } from "@/components/shell/atoms";
import { usePublishOnboardingWizardPrimaryAction } from "@/pages/assurance/onboardingWizard.primaryAction";
import type { OnboardingRunRepository } from "../api";
import { extractErrorMessage } from "../errors";
import {
  readGeneratedFiles,
  readPrError,
  readSandboxError,
  repositoryHasOutput,
  useOnboardingOutput,
  useOpenPullRequests,
} from "../job.api";

/**
 * Step 5, "Open pull requests" (T151, NO-05). One primary action, behind a
 * confirm, opens one PR per repository (the backend acts only on an explicit
 * `confirm: true` and is idempotent, so retrying after a partial failure is
 * safe). Afterwards each repository shows its PR, and per-repository
 * warnings (never raw upstream errors) explain any that didn't open.
 */
export function PullRequestsStep({ runId, teamId }: { runId: string; teamId: string }) {
  const { t } = useTranslation();
  const output = useOnboardingOutput(runId, true);
  const open = useOpenPullRequests();
  const [error, setError] = React.useState<string | null>(null);

  const run = open.data ?? output.data;
  const repos = run?.repositories.filter((r) => r.selected) ?? [];
  const openable = repos.filter((r) => r.pr_number === null && repositoryHasOutput(r));
  const done = run?.status === "prs_open" || run?.status === "completed";
  const canOpen = !!run && run.status !== "completed" && openable.length > 0 && !open.isPending;

  const handleOpen = React.useCallback(async () => {
    setError(null);
    try {
      await open.mutateAsync(runId);
    } catch (e) {
      setError(extractErrorMessage(e, t("onboarding.prs.error")));
    }
  }, [open, runId, t]);

  usePublishOnboardingWizardPrimaryAction(
    run && !(done && openable.length === 0)
      ? {
          label: t("onboarding.prs.open", { count: openable.length }),
          onClick: handleOpen,
          disabled: !canOpen,
          disabledReason: canOpen ? undefined : t("onboarding.prs.nothingToOpen"),
          confirm: t("onboarding.prs.confirm", { count: openable.length }),
        }
      : undefined,
  );

  if (output.isLoading) {
    return (
      <div role="status" className="p-9 text-center text-muted-foreground">
        {t("onboarding.wizard.loading")}
      </div>
    );
  }
  if (!run) {
    return (
      <EmptyState
        title={t("onboarding.output.error.title")}
        description={extractErrorMessage(output.error, t("onboarding.output.error.description"))}
      />
    );
  }

  const allOpen = repos.length > 0 && repos.every((r) => r.pr_number !== null);

  return (
    <div className="flex flex-col gap-4">
      {allOpen ? (
        <NextStepBanner
          tone="ok"
          title={t("onboarding.prs.done.title")}
          body={t("onboarding.prs.done.body")}
        />
      ) : done ? (
        <NextStepBanner tone="warn" title={t("onboarding.prs.partial.title")} body={t("onboarding.prs.partial.body")} />
      ) : (
        <NextStepBanner
          tone="info"
          title={t("onboarding.prs.banner.title")}
          body={t("onboarding.prs.banner.body", { count: openable.length })}
        />
      )}

      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}

      {run.warnings.length > 0 ? (
        <section role="alert" className="rounded-xs border border-warn/40 bg-warn-soft p-3" data-testid="onboarding-pr-warnings">
          <h2 className="text-sm font-semibold text-ink">{t("onboarding.prs.warnings")}</h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink">
            {run.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xs border border-line bg-surface" data-testid="onboarding-prs">
        <h2 className="px-4 py-2.5 text-sm font-semibold text-ink">{t("onboarding.prs.heading")}</h2>
        <ul className="divide-y divide-line border-t border-line">
          {repos.map((repo) => (
            <PrRow key={repo.id} repo={repo} />
          ))}
        </ul>
      </section>

      {run.application_id ? (
        <div>
          <Link
            to={`/assurance/t/${teamId}/apps/${run.application_id}`}
            className="inline-flex min-h-[44px] items-center rounded-xs border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-2"
          >
            {t("onboarding.prs.viewApplication")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function PrRow({ repo }: { repo: OnboardingRunRepository }) {
  const { t } = useTranslation();
  const files = readGeneratedFiles(repo.generated_manifest);
  const failure = readSandboxError(repo.review) ?? readPrError(repo.review);
  const state = repo.pr_state === "open" ? "open" : repo.pr_state === "merged" ? "merged" : "none";

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <code className="block truncate text-ink">{repo.full_name}</code>
        <span className="text-xs text-muted-foreground">{t("onboarding.prs.files", { count: files.length })}</span>
      </div>
      {repo.pr_number !== null ? (
        <PrChip number={repo.pr_number} state={state}>
          {`PR #${repo.pr_number} · ${t(`onboarding.prs.state.${repo.pr_state ?? "open"}`)}`}
        </PrChip>
      ) : failure ? (
        <span className="text-xs font-semibold text-bad">{t("onboarding.prs.notOpened")}</span>
      ) : (
        <PrChip state="none">{t("onboarding.prs.pending")}</PrChip>
      )}
    </li>
  );
}
