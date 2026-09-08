// Frontend: tests for the canvas media-type filter, the toolbar row that
// replaced the old relation-family toggles.
//
// Two things are worth pinning down. The row is derived from the graph rather
// than from the eight known types, so it only ever offers a toggle that does
// something; and toggling dims rather than hides, so the layout a user has
// arranged by hand never moves under them.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RelationGraph from "./RelationGraph";

// React Flow measures its container on mount, and jsdom ships neither
// observer. See RelationGraphUndo.test for why these are per-test stubs.
beforeEach(() => {
  class Stub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Stub);
  vi.stubGlobal("DOMMatrixReadOnly", class {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const GRAPH = {
  nodes: [
    {
      key: "manga:m",
      entry_id: "m",
      media_type: "manga",
      type_label: "Manga",
      display_name: "The Manga",
      in_scope: true,
    },
    {
      key: "anime:a",
      entry_id: "a",
      media_type: "anime",
      type_label: "Anime",
      display_name: "The Anime",
      in_scope: true,
    },
  ],
  edges: [
    {
      system_id: 1,
      from: "anime:a",
      to: "manga:m",
      family: "derivation",
      kind: "adaptation",
      label: "Adaptation",
      inverse_label: "Original",
    },
  ],
};

function mockFetch(graph = GRAPH) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(graph) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("RelationGraph media-type filter", () => {
  it("offers one chip per media type on the canvas", async () => {
    mockFetch();
    render(<RelationGraph readOnly scopeType="franchise" scopeId="f1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^anime$/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^manga$/i })).toBeInTheDocument();
    // Present in MEDIA_TYPE_COLORS but not in this graph: a chip for it would
    // toggle nothing.
    expect(screen.queryByRole("button", { name: /^movie$/i })).toBeNull();
  });

  it("no longer offers the relation-family toggles it replaced", async () => {
    mockFetch();
    render(<RelationGraph readOnly scopeType="franchise" scopeId="f1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^anime$/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /^timeline$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^branch$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^equivalence$/i })).toBeNull();
  });

  it("dims a toggled-off type rather than removing its node", async () => {
    mockFetch();
    render(<RelationGraph readOnly scopeType="franchise" scopeId="f1" />);
    await waitFor(() =>
      expect(screen.getByText("The Manga")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: /^manga$/i }));
    // Still on the canvas, so nothing re-lays out; only its opacity moves.
    expect(screen.getByText("The Manga")).toBeInTheDocument();
    expect(screen.getByText("The Anime")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^manga$/i })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    expect(screen.getByRole("button", { name: /^anime$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("puts a type back when its chip is clicked again", async () => {
    mockFetch();
    render(<RelationGraph readOnly scopeType="franchise" scopeId="f1" />);
    const chip = await screen.findByRole("button", { name: /^manga$/i });
    await userEvent.click(chip);
    await waitFor(() => expect(chip).toHaveAttribute("aria-pressed", "false"));
    await userEvent.click(chip);
    await waitFor(() => expect(chip).toHaveAttribute("aria-pressed", "true"));
  });
});
