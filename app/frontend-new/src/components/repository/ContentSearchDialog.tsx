import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, File } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchResult {
  path: string;
  matches: { line: number; text: string }[];
}

interface ContentSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: { path: string; content: string }[];
  onFileSelect: (path: string) => void;
}

export function ContentSearchDialog({
  open,
  onOpenChange,
  files,
  onFileSelect,
}: ContentSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    const searchResults: SearchResult[] = [];
    const query = searchQuery.toLowerCase();

    files.forEach((file) => {
      const matches: { line: number; text: string }[] = [];
      const lines = file.content.split("\n");

      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query)) {
          matches.push({
            line: index + 1,
            text: line.trim(),
          });
        }
      });

      if (matches.length > 0) {
        searchResults.push({
          path: file.path,
          matches: matches.slice(0, 5), // Limit to 5 matches per file
        });
      }
    });

    setResults(searchResults);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] bg-[var(--ide-bg)] border-[var(--ide-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--ide-ink)]">Search in Files</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ide-muted)]" />
              <Input
                placeholder="Search for content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-8 bg-[var(--ide-input)] border-[var(--ide-border)] text-[var(--ide-ink)] placeholder:text-[var(--ide-muted)]"
              />
            </div>
            <Button
              onClick={handleSearch}
              className="bg-[var(--ide-accent-active)] hover:bg-[var(--ide-accent-hover)] text-white"
            >
              Search
            </Button>
          </div>

          <ScrollArea className="h-[50vh]">
            {results.length === 0 && searchQuery && (
              <div className="text-center text-[var(--ide-muted)] py-8">
                No results found
              </div>
            )}
            {results.length === 0 && !searchQuery && (
              <div className="text-center text-[var(--ide-muted)] py-8">
                Enter a search query to find content in files
              </div>
            )}
            <div className="space-y-4">
              {results.map((result) => (
                <div
                  key={result.path}
                  className="border border-[var(--ide-border)] rounded bg-[var(--ide-panel)]"
                >
                  <div
                    className="flex items-center gap-2 px-3 py-2 border-b border-[var(--ide-border)] cursor-pointer hover:bg-[var(--ide-hover)]"
                    onClick={() => {
                      onFileSelect(result.path);
                      onOpenChange(false);
                    }}
                  >
                    <File className="h-4 w-4 text-[var(--ide-muted)]" />
                    <span className="text-sm text-[var(--ide-ink)] font-medium">
                      {result.path}
                    </span>
                    <span className="ml-auto text-xs text-[var(--ide-muted)]">
                      {result.matches.length} match{result.matches.length > 1 ? "es" : ""}
                    </span>
                  </div>
                  <div className="p-2 space-y-1">
                    {result.matches.map((match, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-[var(--ide-ink)] font-mono px-2 py-1 hover:bg-[var(--ide-hover)] rounded cursor-pointer"
                        onClick={() => {
                          onFileSelect(result.path);
                          onOpenChange(false);
                        }}
                      >
                        <span className="text-[var(--ide-muted)]">{match.line}:</span>{" "}
                        <span>{match.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
