import { Input } from "@/components/ui/input";
import { Search, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileTreeSearchProps {
  fileNameFilter: string;
  onFileNameFilterChange: (value: string) => void;
  onContentSearch: () => void;
  contentSearchEnabled?: boolean;
}

export function FileTreeSearch({
  fileNameFilter,
  onFileNameFilterChange,
  onContentSearch,
  contentSearchEnabled = true,
}: FileTreeSearchProps) {
  return (
    <div className="px-3 py-2 border-b border-[var(--ide-border)] bg-[var(--ide-panel)] space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ide-muted)]" />
        <Input
          placeholder="Filter by filename..."
          value={fileNameFilter}
          onChange={(e) => onFileNameFilterChange(e.target.value)}
          className="h-7 pl-7 bg-[var(--ide-input)] border-[var(--ide-border)] text-[var(--ide-ink)] text-xs placeholder:text-[var(--ide-muted)] focus-visible:ring-[var(--ide-accent)]"
        />
      </div>
      {contentSearchEnabled && (
        <Button
          variant="outline"
          size="sm"
          onClick={onContentSearch}
          className="w-full h-7 gap-1.5 bg-[var(--ide-hover)] text-[var(--ide-ink)] border-[var(--ide-border)] hover:bg-[var(--ide-panel-2)] text-xs"
        >
          <FileSearch className="h-3 w-3" />
          Search in Files
        </Button>
      )}
    </div>
  );
}
