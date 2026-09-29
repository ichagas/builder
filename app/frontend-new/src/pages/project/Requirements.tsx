import { useState } from "react";
import { useVersionScopeContext } from "@/features/versions/scope/context";
import { readOnlyWrite, gateOpener } from "@/features/versions/scope/readOnly";
import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/shell/PageHeader";
import { RequirementsTree } from "@/components/requirements/RequirementsTree";
import { AIDecomposeDialog } from "@/components/requirements/AIDecomposeDialog";
import { LinkStandardsDialog } from "@/components/requirements/LinkStandardsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, ChevronsDown, ChevronsUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRealtimeRequirements } from "@/hooks/useRealtimeRequirements";
import { useShareToken } from "@/hooks/useShareToken";
import { TokenRecoveryMessage } from "@/components/project/TokenRecoveryMessage";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePublishRequirementsPrimaryAction } from "./requirements.primaryAction";

export default function Requirements() {
  // P4 (NV-06): a released version is inspect-only (false outside VersionScope, so v/current is unchanged).
  const { readOnly } = useVersionScopeContext();
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId);
  const { user } = useAuth();
  const hasAccessToken = !!shareToken || !!user;
  const { requirements, isLoading, addRequirement: addRequirementRaw, updateRequirement: updateRequirementRaw, deleteRequirement: deleteRequirementRaw, refresh } = useRealtimeRequirements(
    projectId!,
    shareToken || null,
    hasAccessToken
  );
  const addRequirement = readOnlyWrite(readOnly, addRequirementRaw);
  const updateRequirement = readOnlyWrite(readOnly, updateRequirementRaw);
  const deleteRequirement = readOnlyWrite(readOnly, deleteRequirementRaw);
  const [showAIDialog, setShowAIDialogRaw] = useState(false);
  const [linkReq, setLinkReqRaw] = useState<{ id: string; title: string } | null>(null);
  const [expandAll, setExpandAll] = useState<boolean | undefined>(undefined);

  // T042 (WP-D1): "Add epic" is the page's primary action, declared in the
  // route registry (app/routes/project.tsx) and rendered by PageHeader.
  // Publish it here (where addRequirement/isLoading actually live) rather
  // than duplicating the realtime subscription in the route-level hook --
  // see requirements.primaryAction.ts.
  const setShowAIDialog = gateOpener(readOnly, setShowAIDialogRaw);
  const setLinkReq = gateOpener(readOnly, setLinkReqRaw);

  usePublishRequirementsPrimaryAction(
    projectId && hasAccessToken
      ? {
          label: "Add epic",
          onClick: () => addRequirement(null, "EPIC", "New Epic").then(() => { toast.success("Added"); }),
          disabled: readOnly || isLoading,
          disabledReason: isLoading ? "Loading requirements…" : undefined,
        }
      : undefined
  );

  if (!projectId) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <p className="text-bad">Invalid project ID</p>
      </div>
    );
  }

  // Show token recovery message if tokenMissing
  if (tokenMissing) {
    return (
      <div className="p-4 md:p-6">
        <TokenRecoveryMessage />
      </div>
    );
  }

  // If user is anonymous and no share token is present, block access
  if (!hasAccessToken) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-md space-y-2 text-center px-4">
          <h1 className="text-xl font-semibold text-ink">Share token required</h1>
          <p className="text-sm text-muted-foreground">
            This project can only be accessed via its secure sharing link. Please use the full URL that includes the <code>/t/token</code> path segment.
          </p>
        </div>
      </div>
    );
  }

  // Wait for token to be set before loading data
  if (shareToken && !isTokenSet) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader crumb="Define" />
      <div className="flex-1 overflow-auto px-4 py-6 md:px-6 md:py-8">
        <div className="flex flex-col md:flex-row gap-2 md:gap-3 mb-6">
          <div className="relative flex-1 md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-9 text-sm md:text-base" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAIDialog(true)} className="flex-1 md:flex-none text-sm">
              AI Decompose
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={expandAll ? "Collapse all" : "Expand all"}
                    onClick={() => setExpandAll((prev) => (prev === true ? false : true))}
                  >
                    {expandAll ? <ChevronsUp className="h-4 w-4" /> : <ChevronsDown className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{expandAll ? "Collapse All" : "Expand All"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        {isLoading ? (
          <p className="text-center py-12 text-muted-foreground">Loading...</p>
        ) : requirements.length > 0 ? (
          <div className="bg-card border rounded-lg p-4">
            <RequirementsTree
              requirements={requirements}
              projectId={projectId!}
              shareToken={shareToken}
              expandAll={expandAll}
              onNodeUpdate={(id, u) => {
                updateRequirement(id, u).then(() => toast.success("Updated"));
              }}
              onNodeDelete={(id) => {
                deleteRequirement(id).then(() => toast.success("Deleted"));
              }}
              onNodeAdd={(p, t) => {
                addRequirement(p, t, `New ${t}`).then(() => toast.success("Added"));
              }}
              onExpand={refresh}
              onLinkStandard={(id, title) => setLinkReq({ id, title })}
            />
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No requirements yet</p>
            <Button onClick={() => addRequirement(null, "EPIC", "First Epic")}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Epic
            </Button>
          </div>
        )}
      </div>
      <AIDecomposeDialog open={showAIDialog} onClose={() => setShowAIDialog(false)} projectId={projectId} shareToken={shareToken} onRefresh={refresh} />
      {linkReq && <LinkStandardsDialog open={!!linkReq} onClose={() => setLinkReq(null)} requirementId={linkReq.id} requirementTitle={linkReq.title} shareToken={shareToken} />}
    </div>
  );
}
