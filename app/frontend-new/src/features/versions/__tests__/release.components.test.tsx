import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WorkItem } from "../api";
import { ReleaseChecklist } from "../release/ReleaseChecklist";
import { ReleaseContents } from "../release/ReleaseContents";

const checks = [
  { id: "work-items-resolved", label: "All changes are shipped or declined", passed: false, detail: "1 change(s) still in progress" },
  { id: "no-open-earlier-version", label: "Versions release in order", passed: false, detail: "Release v1.0.1 first" },
  { id: "repository-linked", label: "A repository is linked", passed: true },
];

function item(id: string, status: WorkItem["status"], type: WorkItem["type"], title: string): WorkItem {
  return { id, key: id.toUpperCase(), status, type, title } as WorkItem;
}

describe("ReleaseChecklist", () => {
  it("marks blocking, informational and passing checks", () => {
    render(<ReleaseChecklist checks={checks} firstRelease={false} versionName="v1.1.0" />);
    expect(screen.getByRole("heading", { name: "Release checks for v1.1.0" })).toBeInTheDocument();
    const rows = screen.getByTestId("release-checks").querySelectorAll("li");
    expect(rows[0].getAttribute("data-state")).toBe("info");
    expect(rows[1].getAttribute("data-state")).toBe("fail");
    expect(rows[2].getAttribute("data-state")).toBe("pass");
    expect(screen.getByText("Release v1.0.1 first")).toBeInTheDocument();
  });

  it("treats unresolved changes as blocking for the first release", () => {
    render(<ReleaseChecklist checks={checks} firstRelease versionName="v1.0.0" />);
    expect(screen.getByTestId("release-checks").querySelectorAll("li")[0].getAttribute("data-state")).toBe("fail");
  });
});

describe("ReleaseContents", () => {
  it("drafts notes and lists carry-over to the next version", () => {
    render(
      <ReleaseContents
        versionName="v1.1.0"
        firstRelease={false}
        shipped={[item("a", "shipped", "bug", "Fix login"), item("b", "shipped", "feature", "Export")]}
        carry={[item("c", "active", "enhancement", "Dark mode")]}
      />,
    );
    expect(screen.getByText("Fix login")).toBeInTheDocument();
    expect(screen.getByText("Fixed:")).toBeInTheDocument();
    expect(screen.getByText("New:")).toBeInTheDocument();
    expect(screen.getByText("1 unfinished change moves to v1.2.0 when you release.")).toBeInTheDocument();
    expect(screen.getByText("Dark mode")).toBeInTheDocument();
  });

  it("shows no carry-over section for the first release and says so when empty", () => {
    const { rerender } = render(<ReleaseContents versionName="v1.0.0" firstRelease shipped={[]} carry={[]} />);
    expect(screen.queryByTestId("release-carry")).toBeNull();
    expect(screen.getByText("No changes shipped in this release.")).toBeInTheDocument();
    rerender(<ReleaseContents versionName="v1.1.0" firstRelease={false} shipped={[]} carry={[]} />);
    expect(screen.getByText(/Nothing to carry over/)).toBeInTheDocument();
  });
});
