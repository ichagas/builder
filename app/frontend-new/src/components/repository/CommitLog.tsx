import { useEffect, useState } from "react";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCommit, Calendar, FileCode } from "lucide-react";

interface Commit {
  id: string;
  branch: string;
  commit_sha: string;
  commit_message: string;
  files_changed: number;
  committed_at: string;
}

interface CommitLogProps {
  repoId: string;
  selectedBranch?: string;
  shareToken: string | null;
}

export function CommitLog({ repoId, selectedBranch, shareToken }: CommitLogProps) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCommits();
  }, [repoId, selectedBranch]);

  const loadCommits = async () => {
    setLoading(true);
    try {
      const { data, error } = await pronghornApi.rpc("get_repo_commits_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
        p_branch: selectedBranch || null,
      });

      if (error) throw error;
      setCommits(data || []);
    } catch (error) {
      console.error("Error loading commits:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-[var(--ide-bg)] border-[var(--ide-border)]">
        <CardContent className="py-4 text-center text-[var(--ide-ink)]">
          Loading commits...
        </CardContent>
      </Card>
    );
  }

  if (commits.length === 0) {
    return (
      <Card className="bg-[var(--ide-bg)] border-[var(--ide-border)]">
        <CardContent className="py-4 text-center text-[var(--ide-muted)]">
          No commits yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[var(--ide-bg)] border-[var(--ide-border)]">
      <CardHeader>
        <CardTitle className="text-[var(--ide-ink)] text-sm flex items-center gap-2">
          <GitCommit className="h-4 w-4" />
          Commit History {selectedBranch && `(${selectedBranch})`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {commits.map((commit) => (
              <div
                key={commit.id}
                className="p-3 bg-[var(--ide-panel)] border border-[var(--ide-border)] rounded-lg hover:bg-[var(--ide-hover)] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--ide-ink)] truncate">
                      {commit.commit_message}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--ide-muted)]">
                      <span className="flex items-center gap-1">
                        <GitCommit className="h-3 w-3" />
                        {commit.commit_sha.substring(0, 7)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileCode className="h-3 w-3" />
                        {commit.files_changed} {commit.files_changed === 1 ? "file" : "files"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(commit.committed_at).toLocaleString()}
                      </span>
                    </div>
                    {commit.branch !== "main" && (
                      <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-[var(--ide-border)] text-[var(--ide-ink)] rounded">
                        {commit.branch}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
