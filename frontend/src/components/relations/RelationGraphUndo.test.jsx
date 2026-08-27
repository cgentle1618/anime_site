// Frontend: tests for the canvas toolbar buttons - Undo and Tidy - covering
// their presence and gating.
//
// The reversal rules themselves are unit-tested in lib/relationUndo; what is
// worth checking here is that each button exists only where writing is
// possible, and never offers to undo nothing.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RelationGraph from "./RelationGraph";

// React Flow measures its container on mount, and jsdom ships neither
// observer. Stubbed here rather than in the shared setup file, which other
// suites share and none of them need this.
// Re-applied per test, not once: unstubAllGlobals below restores fetch by
// clearing every stub, and ResizeObserver had no original to restore to.
beforeEach(() => {
  class Stub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Stub);
  vi.stubGlobal("DOMMatrixReadOnly", class {});
});

const EMPTY_GRAPH = { nodes: [], edges: [] };

// The media-type chips are derived from the nodes, so proving the toolbar
// rendered needs a canvas with something on it.
const ONE_NODE_GRAPH = {
  nodes: [
    {
      key: "anime:a",
      entry_id: "a",
      media_type: "anime",
      type_label: "Anime",
      display_name: "A",
      in_scope: true,
    },
  ],
  edges: [],
};

function mockFetch(graph = EMPTY_GRAPH) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(graph) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RelationGraph toolbar buttons", () => {
  it("offers Undo on a writable canvas", async () => {
    mockFetch();
    render(<RelationGraph scopeType="franchise" scopeId="f1" kinds={[]} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument(),
    );
  });

  it("starts disabled, because a fresh page has nothing to reverse", async () => {
    mockFetch();
    render(<RelationGraph scopeType="franchise" scopeId="f1" kinds={[]} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled(),
    );
  });

  it("says what it would undo", async () => {
    mockFetch();
    render(<RelationGraph scopeType="franchise" scopeId="f1" kinds={[]} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /undo/i })).toHaveAttribute(
        "title",
        "Nothing to undo",
      ),
    );
  });

  it("omits Undo entirely on a read-only canvas", async () => {
    mockFetch(ONE_NODE_GRAPH);
    render(<RelationGraph readOnly scopeType="series" scopeId="s1" />);
    // The media-type chip proves the toolbar rendered, so a missing Undo is a
    // real absence rather than a canvas that never mounted.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^anime$/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("offers Tidy on a writable canvas and omits it on a read-only one", async () => {
    // Tidy drops hand-placed positions; a read-only canvas never had any, so
    // the button would reset nothing.
    mockFetch(ONE_NODE_GRAPH);
    const { unmount } = render(
      <RelationGraph scopeType="franchise" scopeId="f1" kinds={[]} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /tidy/i })).toBeInTheDocument(),
    );
    unmount();

    render(<RelationGraph readOnly scopeType="series" scopeId="s1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^anime$/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /tidy/i })).toBeNull();
  });

  it("disables Tidy on an empty canvas, which has nothing to re-lay-out", async () => {
    mockFetch();
    render(<RelationGraph scopeType="franchise" scopeId="f1" kinds={[]} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /tidy/i })).toBeDisabled(),
    );
  });

  it("re-reads the graph when Tidy is clicked", async () => {
    // The reset itself is mergePositions dropping an emptied ref, which is
    // unit-tested in lib/relationLayout. What this proves is the button is
    // wired to the refetch that re-runs the layout at all.
    const fetchMock = mockFetch({
      nodes: [
        {
          key: "anime:a",
          entry_id: "a",
          media_type: "anime",
          display_name: "A",
          in_scope: true,
        },
      ],
      edges: [],
    });
    render(<RelationGraph scopeType="franchise" scopeId="f1" kinds={[]} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /tidy/i })).toBeEnabled(),
    );
    const before = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /tidy/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("asks the graph endpoint for the right scope key", async () => {
    const fetchMock = mockFetch();
    render(<RelationGraph readOnly scopeType="series" scopeId="s1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("series_id=s1");
  });
});
