import * as React from "react";
import { useTranslation } from "react-i18next";
import { NextStepBanner } from "@/components/shell/NextStepBanner";
import { Disclosure } from "@/components/shell/Disclosure";
import { EmptyState } from "@/components/shell/atoms";
import { usePublishOnboardingWizardPrimaryAction } from "@/pages/assurance/onboardingWizard.primaryAction";
import type { OnboardingRunRepository } from "../api";
import { extractErrorMessage } from "../errors";
import { readBaselineCounts, readGeneratedFiles, readSandboxError, repositoryHasOutput, useOnboardingOutput } from "../job.api";

/**
 * Step 4, "Review output" (T151, NO-04): what the sandbox detected and
 * generated per repository (profile, stack, build, CI, part, baseline
 * counts, generated files), plus any per-repository sandbox failure. Nothing
 * is written to a repository yet: that's the next step, behind a confirm.
 */
export function OutputStep({ runId, onContinue }: { runId: string; onContinue: () => void }) {
  const { t } = useTranslation();
  const output = useOnboardingOutput(runId, true);
  const repos = output.data?.repositories.filter((r) => r.selected) ?? [];
  const ready = repos.filter(repositoryHasOutput).length;

  usePublishOnboardingWizardPrimaryAction(
    output.data
      ? {
          label: t("onboarding.output.continue"),
          onClick: onContinue,
          disabled: ready === 0,
          disabledReason: ready === 0 ? t("onboarding.output.nothingToOpen") : undefined,
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
  if (output.isError || !output.data) {
    return (
      <EmptyState
        title={t("onboarding.output.error.title")}
        description={extractErrorMessage(output.error, t("onboarding.output.error.description"))}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {ready === 0 ? (
        <NextStepBanner tone="warn" title={t("onboarding.output.none.title")} body={t("onboarding.output.none.body")} />
      ) : (
        <NextStepBanner
          tone="info"
          title={t("onboarding.output.banner.title")}
          body={t("onboarding.output.banner.body", { ready, total: repos.length })}
        />
      )}
      <ul className="flex flex-col gap-3" data-testid="onboarding-output">
        {repos.map((repo) => (
          <OutputRepoCard key={repo.id} repo={repo} />
        ))}
      </ul>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-ink">{value || t("onboarding.output.unknown")}</dd>
    </div>
  );
}

function OutputRepoCard({ repo }: { repo: OnboardingRunRepository }) {
  const { t } = useTranslation();
  const sandboxError = readSandboxError(repo.review);
  const files = readGeneratedFiles(repo.generated_manifest);
  const counts = readBaselineCounts(repo.baseline_counts);
  const prefix = "onboarding.output.baseline";

  return (
    <li className="rounded-xs border border-line bg-surface" data-testid={"onboarding-output-repo"}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <code className="min-w-0 truncate text-sm font-semibold text-ink">{repo.full_name}</code>
        {sandboxError ? (
          <span className="text-xs font-semibold text-bad">{t("onboarding.output.failedChip")}</span>
        ) : (
          <span className="text-xs font-semibold text-ok">{t("onboarding.output.okChip")}</span>
        )}
      </div>
      {sandboxError ? (
        <p role="alert" className="border-t border-line px-4 py-2 text-sm text-bad">
          {t("onboarding.output.sandboxError", { reason: sandboxError })}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 border-t border-line px-4 py-3 sm:grid-cols-5">
            <Fact label={t("onboarding.output.profile")} value={repo.detected_profile} />
            <Fact label={t("onboarding.output.stack")} value={repo.detected_stack} />
            <Fact label={t("onboarding.output.build")} value={repo.detected_build} />
            <Fact label={t("onboarding.output.ci")} value={repo.detected_ci} />
            <Fact label={t("onboarding.output.part")} value={repo.part} />
          </dl>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-ink">{t(`${prefix}.heading`)}</span>
            <span>{t(`${prefix}.green`, { count: counts.green })}</span>
            <span>{t(`${prefix}.yellow`, { count: counts.yellow })}</span>
            <span>{t(`${prefix}.red`, { count: counts.red })}</span>
            <span>{t(`${prefix}.blue`, { count: counts.blue })}</span>
          </div>
          <div className="border-t border-line p-3">
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("onboarding.output.noFiles")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("onboarding.output.filesHeading", { count: files.length })}
                </p>
                {files.map((file) => (
                  <Disclosure key={file.path} prefKey={`onboarding.file.${repo.id}.${file.path}`} summary={<code>{file.path}</code>}>
                    <pre
                      tabIndex={0}
                      aria-label={t("onboarding.output.fileContent", { path: file.path })}
                      className="max-h-64 overflow-auto rounded-xs bg-surface-2 p-2 font-mono text-xs text-ink"
                    >
                      {file.content ?? t("onboarding.output.noContent")}
                    </pre>
                  </Disclosure>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </li>
  );
}
