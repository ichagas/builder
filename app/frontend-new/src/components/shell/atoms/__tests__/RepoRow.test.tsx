import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RepoRow } from "../RepoRow";

describe("RepoRow", () => {
  it("renders the repo name, note and findings", () => {
    render(
      <RepoRow
        name="pronghorn-api"
        note="Payments · Standards 2026.2"
        stack={{ profile: "node", label: "Node 20" }}
        findings="baseline 4 · new 1"
        mesh={{ green: "pass", yellow: "pass", red: "pass", blue: "pass" }}
        pr={{ number: 12, state: "open" }}
      />,
    );
    expect(screen.getByText("pronghorn-api")).toBeInTheDocument();
    expect(screen.getByText("Payments · Standards 2026.2")).toBeInTheDocument();
    expect(screen.getByText("Node 20")).toBeInTheDocument();
    expect(screen.getByText("baseline 4 · new 1")).toBeInTheDocument();
    expect(screen.getByText("PR #12 · open")).toBeInTheDocument();
  });

  it("renders a label-only PR chip when there is no open PR", () => {
    render(
      <RepoRow
        name="pronghorn-web"
        stack={{ profile: "python", label: "Python 3.12" }}
        mesh={{}}
        pr={{ state: "none", label: "In sync" }}
      />,
    );
    expect(screen.getByText("In sync")).toBeInTheDocument();
  });

  it("always renders the mesh verdict group", () => {
    render(<RepoRow name="repo" stack={{ profile: "java", label: "Java 17" }} mesh={{ green: "fail" }} />);
    expect(screen.getByLabelText(/Assurance Mesh:/)).toBeInTheDocument();
  });
});
