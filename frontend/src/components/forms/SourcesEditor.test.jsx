// The one editor behind every media type's Sources block. Guards the three
// things the eight copy-pasted editors used to get subtly wrong: rows are
// identified by index not by name, a blank name is dropped on save, and the
// bucket is explicit rather than implied.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SourcesEditor from "./SourcesEditor";

const sources = {
  options: [
    { category: "Platform", value: "Netflix", scopes: [], usages: [] },
    { category: "Platform", value: "Fox", scopes: [], usages: ["origin"] },
    {
      category: "Reference Source",
      value: "Official Site",
      scopes: [],
      usages: [],
    },
  ],
};

function renderEditor(value = [], onChange = vi.fn()) {
  render(
    <SourcesEditor
      value={value}
      onChange={onChange}
      mediaType="anime"
      sources={sources}
    />,
  );
  return onChange;
}

describe("SourcesEditor", () => {
  it("adds a free-form row to the other bucket", () => {
    const onChange = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /add other source/i }));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "access", bucket: "other", name: "", url: "", available: null },
    ]);
  });

  it("adds a row to the restricted bucket separately", () => {
    const onChange = renderEditor();
    fireEvent.click(
      screen.getByRole("button", { name: /add restricted source/i }),
    );
    expect(onChange).toHaveBeenCalledWith([
      {
        kind: "access",
        bucket: "restricted",
        name: "",
        url: "",
        available: null,
      },
    ]);
  });

  it("removes the row at the clicked index, not the first with that name", () => {
    const rows = [
      { kind: "access", bucket: "other", name: "Same", url: "a" },
      { kind: "access", bucket: "other", name: "Same", url: "b" },
    ];
    const onChange = renderEditor(rows);
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[1]);
    expect(onChange).toHaveBeenCalledWith([rows[0]]);
  });

  it("does not offer an origin-only platform as a watch source", () => {
    renderEditor([
      { kind: "access", bucket: "main", name: "", url: "", available: null },
    ]);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Netflix");
    expect(options).not.toContain("Fox");
  });

  it("adds a reference row with no availability and no free-form bucket", () => {
    const onChange = renderEditor();
    fireEvent.click(
      screen.getByRole("button", { name: /add reference source/i }),
    );
    expect(onChange).toHaveBeenCalledWith([
      {
        kind: "reference",
        bucket: "main",
        name: "",
        url: "",
        available: null,
      },
    ]);
  });

  it("offers Reference Source values but not Platform values in the reference dropdown", () => {
    renderEditor([
      {
        kind: "reference",
        bucket: "main",
        name: "",
        url: "",
        available: null,
      },
    ]);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Official Site");
    expect(options).not.toContain("Netflix");
  });

  it("keeps a reference row and an access row with the same name from colliding", () => {
    const rows = [
      { kind: "access", bucket: "main", name: "Netflix", url: "", available: null },
      { kind: "reference", bucket: "main", name: "Netflix", url: "", available: null },
    ];
    const onChange = renderEditor(rows);
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[1]);
    expect(onChange).toHaveBeenCalledWith([rows[0]]);
  });
});
