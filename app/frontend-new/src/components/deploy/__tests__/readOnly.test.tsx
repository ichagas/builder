import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VersionScopeContext } from "@/features/versions/scope/context";
import { DatabaseCard } from "../DatabaseCard";

/** P4 (NV-06): the database card menu is portaled outside the ReadOnlyGuard, so its mutating items disable themselves. */

vi.mock("@/integrations/pronghorn-api/client", () => ({
  pronghornApi: { functions: { invoke: vi.fn() }, rpc: vi.fn() },
}));

const database = { id: "d1", name: "Main", status: "available", has_connection_info: true, database_internal_name: "x", render_postgres_id: "r", plan: "free" };

function card(readOnly: boolean | undefined) {
  const ui = <DatabaseCard database={database} shareToken={null} onRefresh={() => {}} onExplore={() => {}} />;
  return render(readOnly === undefined ? ui : <VersionScopeContext.Provider value={{ readOnly, version: null }}>{ui}</VersionScopeContext.Provider>);
}

async function openMenu() {
  const user = userEvent.setup();
  const triggers = document.querySelectorAll('button[aria-haspopup="menu"]');
  await user.click(triggers[triggers.length - 1] as HTMLElement);
}

describe("DatabaseCard menu (P4)", () => {
  it("read-only: Edit, Sync and Delete are disabled, Explore and connection info stay enabled", async () => {
    card(true);
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: /edit configuration/i })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /sync status/i })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /delete/i })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /explore/i })).not.toHaveAttribute("aria-disabled");
  });

  it.each([false, undefined])("editable (readOnly %s): the same items are enabled", async (readOnly) => {
    card(readOnly);
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: /edit configuration/i })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("menuitem", { name: /delete/i })).not.toHaveAttribute("aria-disabled");
  });
});
