import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VersionScopeContext } from "@/features/versions/scope/context";
import { CodeEditor } from "../CodeEditor";
import { FileTreeContextMenu } from "../FileTreeContextMenu";

/** P4 (NV-06): the Repository editor and file-tree menu on a released version. */

const monaco = vi.hoisted(() => ({ options: {} as Record<string, unknown> }));

vi.mock("@monaco-editor/react", () => ({
  default: (props: { options: Record<string, unknown> }) => {
    monaco.options = props.options;
    return <div data-testid="monaco" />;
  },
  DiffEditor: () => <div data-testid="monaco-diff" />,
}));
vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
  },
}));
vi.mock("@/lib/stagedContentClient", () => ({ fetchStagedFileContent: vi.fn().mockResolvedValue("") }));

function withScope(readOnly: boolean | undefined, ui: React.ReactNode) {
  return readOnly === undefined ? (
    <>{ui}</>
  ) : (
    <VersionScopeContext.Provider value={{ readOnly, version: null }}>{ui}</VersionScopeContext.Provider>
  );
}

const editor = (
  <CodeEditor
    fileId={null}
    filePath="src/a.ts"
    repoId="repo"
    bufferContent="const a = 1;"
    bufferOriginalContent="const a = 1;"
    onClose={() => {}}
  />
);

describe("CodeEditor (P4)", () => {
  it("is read-only with no Save button on a released version, but still shows the file", () => {
    render(withScope(true, editor));
    expect(screen.getByTestId("monaco")).toBeInTheDocument();
    expect(monaco.options.readOnly).toBe(true);
    expect(monaco.options.domReadOnly).toBe(true);
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  it.each([false, undefined])("stays editable when readOnly is %s", (readOnly) => {
    render(withScope(readOnly, editor));
    expect(monaco.options.readOnly).toBe(false);
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });
});

describe("FileTreeContextMenu (P4)", () => {
  const menu = (
    <FileTreeContextMenu type="file" onNewFile={() => {}} onNewFolder={() => {}}>
      <button>file.ts</button>
    </FileTreeContextMenu>
  );

  it("renders only the entry (no menu) on a released version", () => {
    const { container } = render(withScope(true, menu));
    expect(screen.getByText("file.ts")).toBeInTheDocument();
    expect(container.querySelector("[data-state]")).toBeNull();
  });

  it("wraps the entry in the context-menu trigger otherwise", () => {
    const { container } = render(withScope(false, menu));
    expect(container.querySelector("[data-state]")).not.toBeNull();
  });
});
