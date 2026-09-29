import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ActionButton } from "@/components/shell/ActionButton";
import { EmptyState } from "@/components/shell/atoms";
import { Switch } from "@/components/ui/switch";
import { pushUndo } from "@/lib/state/useUndo";
import {
  MESH_AGENTS,
  useMeshPolicy,
  useSetMeshPolicy,
  type MeshAgent,
  type MeshPolicyMode,
  type MeshPolicyScope,
} from "@/features/assurance/api";
import { POLICY_MODES, MODE_RANK, canSetMode } from "@/features/assurance/governance.api";

export interface PolicyEditorProps {
  scope: MeshPolicyScope;
  scopeId: string;
  /** Organization admins may set anything; owners may only tighten. */
  isOrgAdmin: boolean;
  /** Team owner (or org admin). Members see the policy read-only. */
  canWrite: boolean;
}

function PolicyRow({ agent, current, scope, scopeId, isOrgAdmin, canWrite, explicit }: {
  agent: MeshAgent;
  current: MeshPolicyMode;
  scope: MeshPolicyScope;
  scopeId: string;
  isOrgAdmin: boolean;
  canWrite: boolean;
  explicit: boolean;
}) {
  const { t } = useTranslation();
  const setPolicy = useSetMeshPolicy();
  const [pending, setPending] = React.useState<MeshPolicyMode>(current);
  React.useEffect(() => setPending(current), [current]);

  const loosens = MODE_RANK[pending] < MODE_RANK[current];
  const changed = pending !== current;
  const name = t(`assurance.governance.policy.checks.${agent}`);

  const apply = async () => {
    const previous = current;
    try {
      await setPolicy.mutateAsync({ scope, scopeId, agent, mode: pending });
    } catch {
      toast.error(t("assurance.governance.policy.saveFailed"));
      throw new Error("save failed");
    }
    toast.success(t("assurance.governance.policy.saved"));
    // Undo is offered only when the reverse move is allowed for this caller.
    if (canSetMode(pending, previous, isOrgAdmin)) {
      pushUndo({
        text: t("assurance.governance.policy.undoText", { check: name, mode: t(`assurance.governance.policy.mode.${previous}`) }),
        // NOTE: there is no delete/reset endpoint (contracts/api.md), so undoing a
        // change to an inherited check writes an explicit row at this scope with the
        // previous effective mode rather than removing the override.
        undo: () => {
          setPolicy.mutateAsync({ scope, scopeId, agent, mode: previous }).catch(() => {
            toast.error(t("assurance.governance.policy.undoFailed", { check: name }));
          });
        },
      });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-pad py-3" data-testid={`governance-policy-row-${agent}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{name}</span>
        <span className="block text-xs text-muted-foreground">
          {t(`assurance.governance.policy.checkRole.${agent}`)} · {explicit ? t("assurance.governance.policy.explicit") : t("assurance.governance.policy.inherited")}
        </span>
      </span>
      <select
        aria-label={t("assurance.governance.policy.modeAria", { check: name })}
        value={pending}
        disabled={!canWrite}
        onChange={(e) => setPending(e.target.value as MeshPolicyMode)}
        className="h-11 rounded-xs border border-line bg-surface px-2 text-sm text-ink disabled:opacity-60 sm:h-9"
      >
        {POLICY_MODES.map((mode) => (
          <option key={mode} value={mode} disabled={!canSetMode(current, mode, isOrgAdmin)}>
            {t(`assurance.governance.policy.mode.${mode}`)}
          </option>
        ))}
      </select>
      {changed ? (
        <ActionButton
          label={t("assurance.governance.policy.apply", { check: name })}
          confirm={loosens ? t("assurance.governance.policy.loosenConfirm", { check: name }) : undefined}
          tone={loosens ? "danger" : "primary"}
          onAction={apply}
        />
      ) : null}
    </div>
  );
}

/** Per-check mesh policy for one scope (NA-06). Reuses the A6 hooks from features/assurance/api. */
export function PolicyEditor({ scope, scopeId, isOrgAdmin, canWrite }: PolicyEditorProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useMeshPolicy(scope, scopeId);
  const setPolicy = useSetMeshPolicy();

  if (isLoading) {
    return (
      <div role="status" className="p-9 text-center text-muted-foreground">
        {t("assurance.governance.policy.loading")}
      </div>
    );
  }
  if (isError || !data) {
    return <EmptyState title={t("assurance.governance.policy.error.title")} description={t("assurance.governance.policy.error.description")} />;
  }

  const explicitAgents = new Set((data.explicit ?? []).map((row) => row.agent));
  const showSandbox = scope === "application" || scope === "repository";

  return (
    <div>
      <div className="divide-y divide-line" data-testid="governance-policy-rows">
        {MESH_AGENTS.map((agent) => (
          <PolicyRow
            key={agent}
            agent={agent}
            current={data.effective[agent] ?? "issue"}
            scope={scope}
            scopeId={scopeId}
            isOrgAdmin={isOrgAdmin}
            canWrite={canWrite}
            explicit={explicitAgents.has(agent)}
          />
        ))}
      </div>
      {showSandbox ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-pad py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{t("assurance.governance.policy.sandbox.title")}</span>
            <span className="block text-xs text-muted-foreground">{t("assurance.governance.policy.sandbox.description")}</span>
          </span>
          <Switch
            aria-label={t("assurance.governance.policy.sandbox.aria")}
            checked={data.cyberRiskSandbox}
            disabled={!canWrite || (!isOrgAdmin && data.cyberRiskSandbox)}
            onCheckedChange={(checked) =>
              setPolicy.mutate(
                { scope, scopeId, cyberRiskSandbox: checked },
                { onError: () => toast.error(t("assurance.governance.policy.saveFailed")) },
              )
            }
          />
        </div>
      ) : null}
      {!canWrite ? <p className="border-t border-line px-pad py-2 text-xs text-muted-foreground">{t("assurance.governance.policy.readOnly")}</p> : null}
    </div>
  );
}

export default PolicyEditor;
