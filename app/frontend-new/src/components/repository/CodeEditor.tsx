import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle, useRef } from "react";
import Editor from "@monaco-editor/react";
import { DiffEditor } from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { pronghornApi } from "@/integrations/pronghorn-api/client";
import { fetchStagedFileContent } from "@/lib/stagedContentClient";
import { useVersionScopeContext } from "@/features/versions/scope/context";
import { Save, X, FileText, ImageIcon, GitCompare, Eye } from "lucide-react";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif", "tiff", "tif"];

function isImageFile(path: string | null): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext || "");
}

function getImageMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    svg: "image/svg+xml",
  };
  return mimeMap[ext || ""] || "image/png";
}

export interface CodeEditorHandle {
  save: () => Promise<boolean>;
  isDirty: () => boolean;
}

interface CodeEditorProps {
  fileId: string | null;
  filePath: string | null;
  repoId: string;
  shareToken?: string | null;
  isStaged?: boolean;
  isBinary?: boolean;
  // Buffer-based props (new pattern)
  bufferContent?: string;
  bufferOriginalContent?: string;
  onContentChange?: (content: string) => void;
  // Legacy props for StagingPanel compatibility
  initialContent?: string;
  showDiff?: boolean;
  diffOldContent?: string;
  onShowDiffChange?: (show: boolean) => void;
  onClose: () => void;
  onSave?: () => void;
  onAutoSync?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(({
  fileId,
  filePath,
  repoId,
  shareToken,
  isStaged,
  isBinary,
  bufferContent,
  bufferOriginalContent,
  onContentChange,
  initialContent,
  showDiff = false,
  diffOldContent,
  onShowDiffChange,
  onClose,
  onSave,
  onAutoSync,
  onDirtyChange,
}, ref) => {
  // Use buffer content if provided, otherwise manage internally
  const isBufferMode = bufferContent !== undefined;
  const [internalContent, setInternalContent] = useState("");
  const [internalOriginalContent, setInternalOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  // Track the current load generation so a stale async response is ignored
  const loadGenRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const showDiffMode = showDiff ?? false;
  const handleShowDiffToggle = (checked: boolean) => {
    onShowDiffChange?.(checked);
  };
  const { toast } = useToast();
  // P4 (NV-06): Monaco is read-only and nothing is staged on a released version.
  // Also covers the IDE modal and the Build staging panel, which reuse this editor.
  const { readOnly } = useVersionScopeContext();
  // Monaco's onMount runs once; read the latest value through a ref so a scope change after mount is honored.
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // Resolved content values
  const content = isBufferMode ? bufferContent : internalContent;
  const originalContent = isBufferMode ? (bufferOriginalContent ?? "") : internalOriginalContent;

  const setContent = (value: string) => {
    if (isBufferMode) {
      onContentChange?.(value);
    } else {
      setInternalContent(value);
    }
  };

  // Track dirty state
  const isDirty = useMemo(() => {
    return content !== originalContent && !loading;
  }, [content, originalContent, loading]);

  // Report dirty state changes to parent
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    // Skip internal loading if in buffer mode
    if (isBufferMode) {
      setLoading(false);
      return;
    }

    if (initialContent !== undefined) {
      // Use provided content directly when passed in (e.g. from StagingPanel)
      setInternalContent(initialContent);
      // Use diffOldContent as the original baseline when provided, otherwise fall back to initialContent
      if (typeof diffOldContent === "string") {
        setInternalOriginalContent(diffOldContent);
      } else {
        setInternalOriginalContent(initialContent);
      }
      setLoading(false);
    } else if (fileId) {
      loadFileContent();
    } else {
      setInternalContent("");
      setInternalOriginalContent("");
    }
  }, [fileId, isStaged, filePath, initialContent, diffOldContent, isBufferMode]);

  // Reset markdown preview when file changes
  useEffect(() => {
    setShowMarkdown(false);
  }, [filePath]);

  const loadFileContent = async () => {
    if (!filePath && !fileId) return;

    // Increment the generation counter; capture the value for this request
    const generation = ++loadGenRef.current;

    setLoading(true);
    try {
      // If we have staged content for this file, prefer that — fetch via StagedContentStore client
      if (repoId && filePath && isStaged) {
        const staged = await fetchStagedFileContent(repoId, filePath, shareToken || null);

        // Discard result if a newer load was started while this was in-flight
        if (generation !== loadGenRef.current) return;

        if (staged !== null) {
          setInternalContent(staged.content);
          setInternalOriginalContent(staged.oldContent);
          console.log("Loaded staged content for:", filePath, "operation:", staged.operationType);
          return;
        } else {
          console.log("No staged content found for:", filePath);
        }
      }

      if (fileId) {
        // Load from repo_files for committed files
        const { data, error } = await pronghornApi.rpc("get_file_content_with_token", {
          p_file_id: fileId,
          p_token: shareToken || null,
        });

        // Discard result if a newer load was started while this was in-flight
        if (generation !== loadGenRef.current) return;

        if (error) {
          console.error("Error loading file content:", error);
          throw error;
        }
        if (data && data.length > 0) {
          setInternalContent(data[0].content);
          setInternalOriginalContent(data[0].content);
        }
      }
    } catch (error) {
      if (generation !== loadGenRef.current) return;
      console.error("Error loading file:", error);
      toast({
        title: "Error",
        description: "Failed to load file content",
        variant: "destructive",
      });
    } finally {
      if (generation === loadGenRef.current) setLoading(false);
    }
  };

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (readOnly || !filePath || !repoId) return false;

    // In buffer mode, just call onSave and let the buffer handle it
    if (isBufferMode) {
      onSave?.();
      return true;
    }

    setSaving(true);
    try {
      // `fileId` is only ever a repo_files id (never a staging row id) because
      // Repository.tsx explicitly sets fileId=null for staged-only files and
      // passes isStaged=true.  The heuristic below is therefore reliable:
      //   fileId set   → existing committed file being modified
      //   fileId null  → new file that has no committed row yet
      const operationType = fileId ? "modify" : "add";

      const { error } = await pronghornApi.rpc("stage_file_change_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
        p_operation_type: operationType,
        p_file_path: filePath,
        p_old_content: null,
        p_new_content: internalContent,
      });

      if (error) throw error;

      // Update originalContent to match saved content (no longer dirty)
      setInternalOriginalContent(internalContent);

      toast({
        title: "Staged",
        description:
          "File changes staged successfully. Commit from Build page to persist.",
      });
      onSave?.();
      onAutoSync?.();  // Trigger sync to update other views
      return true;
    } catch (error) {
      console.error("Error staging file:", error);
      toast({
        title: "Error",
        description: "Failed to stage file changes",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [readOnly, filePath, repoId, shareToken, internalContent, fileId, toast, onSave, onAutoSync, isBufferMode]);

  // Expose save method and isDirty getter via ref
  useImperativeHandle(ref, () => ({
    save: handleSave,
    isDirty: () => isDirty,
  }), [handleSave, isDirty]);

  const getLanguage = (path: string | null) => {
    if (!path) return "plaintext";
    const ext = path.split(".").pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      mjs: "javascript",
      cjs: "javascript",
      ts: "typescript",
      tsx: "typescript",
      vue: "html",
      py: "python",
      java: "java",
      kt: "kotlin",
      cpp: "cpp",
      c: "c",
      h: "cpp",
      cs: "csharp",
      go: "go",
      rs: "rust",
      rb: "ruby",
      php: "php",
      html: "html",
      htm: "html",
      css: "css",
      scss: "scss",
      sass: "scss",
      less: "less",
      json: "json",
      jsonc: "json",
      xml: "xml",
      svg: "xml",
      yaml: "yaml",
      yml: "yaml",
      md: "markdown",
      markdown: "markdown",
      sql: "sql",
      sh: "shell",
      bash: "shell",
      zsh: "shell",
      dockerfile: "dockerfile",
      toml: "ini",
      ini: "ini",
      conf: "ini",
      properties: "ini",
    };
    return langMap[ext || ""] || "plaintext";
  };

  // Check if this is an image file that should be displayed as an image
  const isImage = isImageFile(filePath);
  const imageDataUrl = useMemo(() => {
    if (!isImage || !content) return null;
    const mimeType = getImageMimeType(filePath || "");
    // Content is already base64 encoded for binary files
    return `data:${mimeType};base64,${content}`;
  }, [isImage, content, filePath]);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--ide-bg)] text-[var(--ide-ink)]">
        Select a file to edit
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--ide-bg)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--ide-border)] bg-[var(--ide-panel)]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Dirty indicator - yellow dot */}
          {isDirty && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="h-2 w-2 rounded-full bg-warn shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Unsaved changes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isImage ? (
            <ImageIcon className="h-4 w-4 text-[var(--ide-ink)] shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-[var(--ide-ink)] shrink-0" />
          )}
          <h3 className="text-sm font-normal truncate text-[var(--ide-ink)]">{filePath}</h3>
        </div>
        <div className="flex items-center gap-3">
          {!isImage && (
            <TooltipProvider>
              <div className="flex items-center gap-1">
                {/* Show Diff Toggle - always visible */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Toggle
                      size="sm"
                      pressed={showDiffMode}
                      onPressedChange={(pressed) => {
                        handleShowDiffToggle(pressed);
                        if (pressed) setShowMarkdown(false);
                      }}
                      className="h-8 px-2 border border-[var(--ide-border)] text-[var(--ide-ink)] hover:bg-[var(--ide-border)] hover:text-white data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600"
                    >
                      <GitCompare className="h-4 w-4" />
                    </Toggle>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Show diff view</p>
                  </TooltipContent>
                </Tooltip>

                {/* Show Markdown Toggle - for all text files */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Toggle
                      size="sm"
                      pressed={showMarkdown}
                      onPressedChange={(pressed) => {
                        setShowMarkdown(pressed);
                        if (pressed && showDiffMode) handleShowDiffToggle(false);
                      }}
                      className="h-8 px-2 border border-[var(--ide-border)] text-[var(--ide-ink)] hover:bg-[var(--ide-border)] hover:text-white data-[state=on]:bg-green-600 data-[state=on]:text-white data-[state=on]:border-green-600"
                    >
                      <Eye className="h-4 w-4" />
                    </Toggle>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Preview as Markdown</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          )}
          <div className="flex gap-1">
            {!isImage && !readOnly && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || loading}
                variant="secondary"
                className="h-8 gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-8 hover:bg-[var(--ide-hover)] text-[var(--ide-ink)]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[var(--ide-ink)]">
            Loading...
          </div>
        ) : isImage && imageDataUrl ? (
          <div className="flex items-center justify-center h-full p-4 bg-[var(--ide-bg)]">
            <img
              src={imageDataUrl}
              alt={filePath}
              className="max-w-full max-h-full object-contain"
              onError={() => {
                toast({
                  title: "Image Error",
                  description: "Failed to load image preview",
                  variant: "destructive",
                });
              }}
            />
          </div>
        ) : showMarkdown ? (
          <div className="h-full overflow-auto p-6 bg-[var(--ide-bg)] text-[var(--ide-ink)]">
            <div className="prose prose-invert prose-sm max-w-none 
              prose-headings:text-[var(--ide-ink-bright-2)] prose-headings:font-semibold
              prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
              prose-p:text-[var(--ide-ink)] prose-p:leading-relaxed
              prose-a:text-[var(--ide-link)] prose-a:no-underline hover:prose-a:underline
              prose-strong:text-[var(--ide-ink-bright-2)] prose-strong:font-semibold
              prose-code:text-[var(--ide-string)] prose-code:bg-[var(--ide-input-alt)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
              prose-pre:bg-[var(--ide-input-alt)] prose-pre:border prose-pre:border-[var(--ide-border)]
              prose-blockquote:border-l-[var(--ide-type)] prose-blockquote:text-[var(--ide-variable)]
              prose-ul:text-[var(--ide-ink)] prose-ol:text-[var(--ide-ink)]
              prose-li:marker:text-[var(--ide-muted-2)]
              prose-hr:border-[var(--ide-border)]
              prose-table:text-[var(--ide-ink)]
              prose-th:bg-[var(--ide-input-alt)] prose-th:border prose-th:border-[var(--ide-border)] prose-th:px-3 prose-th:py-2
              prose-td:border prose-td:border-[var(--ide-border)] prose-td:px-3 prose-td:py-2
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        ) : showDiffMode ? (
          <DiffEditor
            original={originalContent}
            modified={content}
            language={getLanguage(filePath)}
            theme="vs-dark"
            onMount={(editor) => {
              const modifiedEditor = editor.getModifiedEditor();
              modifiedEditor.onDidChangeModelContent(() => {
                if (readOnlyRef.current) return;
                const value = modifiedEditor.getValue();
                setContent(value);
              });
            }}
            options={{
              readOnly,
              domReadOnly: readOnly,
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              renderSideBySide: false, // Inline diff mode with green/red overlays
              renderOverviewRuler: false,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "on",
              diffWordWrap: "on",
              enableSplitViewResizing: false,
              renderIndicators: true,
              ignoreTrimWhitespace: false,
              fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', 'Monaco', monospace",
              fontLigatures: true,
              cursorBlinking: "smooth",
              smoothScrolling: true,
              renderLineHighlight: "all",
            }}
          />
        ) : (
          <Editor
            height="100%"
            language={getLanguage(filePath)}
            value={content}
            onChange={(value) => {
              if (!readOnly) setContent(value || "");
            }}
            theme="vs-dark"
            options={{
              readOnly,
              domReadOnly: readOnly,
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', 'Monaco', monospace",
              fontLigatures: true,
              cursorBlinking: "smooth",
              smoothScrolling: true,
              renderLineHighlight: "all",
              bracketPairColorization: { enabled: true },
              wordWrap: "on",
              tabSize: 2,
              insertSpaces: true,
              detectIndentation: true,
              formatOnPaste: true,
              formatOnType: true,
            }}
          />
        )}
      </div>
    </div>
  );
});

CodeEditor.displayName = "CodeEditor";
