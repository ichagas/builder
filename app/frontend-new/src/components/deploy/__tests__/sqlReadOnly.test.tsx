import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VersionScopeContext } from "@/features/versions/scope/context";
import { SqlQueryEditor } from "../SqlQueryEditor";

/** P4 (NV-06): the SQL console on a released version cannot run or save. */

const monaco = vi.hoisted(() => ({
  options: {} as Record<string, unknown>,
  onMount: undefined as undefined | ((editor: unknown, monaco: unknown) => void),
}));

vi.mock("@monaco-editor/react", () => ({
  default: (props: { options: Record<string, unknown>; onMount?: (e: unknown, m: unknown) => void }) => {
    monaco.options = props.options;
    monaco.onMount = props.onMount;
    return <div data-testid="monaco" />;
  },
}));

function mount(readOnly: boolean | undefined, onExecute = vi.fn().mockResolvedValue(undefined), onSaveQuery = vi.fn()) {
  const ui = <SqlQueryEditor query="SELECT 1;" onQueryChange={() => {}} onExecute={onExecute} onSaveQuery={onSaveQuery} />;
  render(readOnly === undefined ? ui : <VersionScopeContext.Provider value={{ readOnly, version: null }}>{ui}</VersionScopeContext.Provider>);
  const commands: Array<() => void> = [];
  monaco.onMount?.(
    { addCommand: (_key: number, cb: () => void) => commands.push(cb), getValue: () => "SELECT 1;", focus: () => {} },
    { KeyMod: { CtrlCmd: 1 }, KeyCode: { Enter: 2, KeyS: 3 } },
  );
  return { onExecute, onSaveQuery, commands };
}

describe("SqlQueryEditor (P4)", () => {
  it("read-only: Monaco is read-only, Run and Save are disabled, shortcuts do nothing", () => {
    const { onExecute, onSaveQuery, commands } = mount(true);
    expect(monaco.options.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /run/i })).toBeDisabled();
    expect(screen.getByTitle(/save query/i)).toBeDisabled();
    commands.forEach((run) => run());
    expect(onExecute).not.toHaveBeenCalled();
    expect(onSaveQuery).not.toHaveBeenCalled();
  });

  it.each([false, undefined])("editable (readOnly %s): Run and Save work", (readOnly) => {
    const { onSaveQuery, commands } = mount(readOnly);
    expect(monaco.options.readOnly).toBe(false);
    expect(screen.getByRole("button", { name: /run/i })).toBeEnabled();
    expect(screen.getByTitle(/save query/i)).toBeEnabled();
    commands[1]();
    expect(onSaveQuery).toHaveBeenCalledWith("SELECT 1;");
  });
});
