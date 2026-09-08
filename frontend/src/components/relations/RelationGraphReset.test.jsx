// Frontend: tests for the toolbar's Reset button.
//
// Reset is the one canvas write with no undo behind it, so what matters here
// is the gating - it exists only where writing is possible, refuses to fire on
// a canvas with no relations, and does nothing at all if the confirm is
// declined. The deletion itself is one server call, tested in
// tests/api/test_media_relation.py.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RelationGraph from "./RelationGraph";

beforeEach(() => {
  class Stub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Stub);
  vi.stubGlobal("DOMMatrixReadOnly", class {});
});

const node = (key) => ({
  key,
  entry_id: key.split(":")[1],
  media_type: "anime",
  type_label: "Anime",
  display_name: key,
  in_scope: true,
});

// One relation, which is what enables the button.
const LINKED_GRAPH = {
  nodes: [node("anime:a"), node("anime:b")],
  edges: [
    {
      system_id: "r1",
      from: "anime:b",
      to: "anime:a",
      relation_type: "sequel",
      family: "timeline",
      label: "Sequel",
      remark: null,
    },
  ],
};

const EMPTY_GRAPH = { nodes: [node("anime:a")], edges: [] };

function mockFetch(graph) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(graph) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RelationGraph Reset", () => {
  it("omits Reset on a read-only canvas", async () => {
    // The detail pages mount the graph read-only; a viewer must not be able to
    // empty a franchise from a hub page.
    mockFetch(LINKED_GRAPH);
    render(<RelationGraph readOnly scopeType="series" scopeId="s1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^anime$/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /reset/i })).toBeNull();
  });

  it("is disabled when the canvas has no relations to remove", async () => {
    mockFetch(EMPTY_GRAPH);
    render(<RelationGraph scopeType="franchise" scopeId="f1" kinds={[]} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /reset/i })).toBeDisabled(),
    );
  });

  it("deletes the whole scope in one request once confirmed", async () => {
    const fetchMock = mockFetch(LINKED_GRAPH);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RelationGraph scopeType="collection" scopeId="c1" kinds={[]} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /reset/i })).toBeEnabled(),
    );

    await userEvent.click(screen.getByRole("button", { name: /reset/i }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "DELETE",
      );
      expect(del).toBeTruthy();
      // The scope goes on the URL, and it is the scope currently on screen.
      expect(del[0]).toContain("/api/media-relation/scope");
      expect(del[0]).toContain("collection_id=c1");
    });
    // One call for the lot, not one per edge.
    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "DELETE",
    );
    expect(deletes).toHaveLength(1);
  });

  it("counts the relations it would remove in the confirm", async () => {
    // The count is the whole warning: there is no undo behind this press.
    const fetchMock = mockFetch(LINKED_GRAPH);
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RelationGraph scopeType="franchise" scopeId="f1" kinds={[]} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /reset/i })).toBeEnabled(),
    );

    await userEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(confirmed.mock.calls[0][0]).toContain("1 relation");
    expect(confirmed.mock.calls[0][0]).toMatch(/cannot be undone/i);
    // Declined, so nothing was written.
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(0);
  });

  // Not covered here: that a reset empties the undo stack. Seeding the stack
  // needs an edge selected or a connection dragged, and React Flow draws no
  // edges under jsdom (it places them from measured node geometry), so neither
  // is reachable from a test. The clearing is one setHistory([]) in resetScope.
});

describe("RelationGraph selection", () => {
  // Node clicks use fireEvent.click, not userEvent: userEvent also fires
  // mousedown, and React Flow's d3-drag handler reads `event.view.document`,
  // which jsdom leaves null - an uncaught TypeError that failed the whole run
  // even though every assertion passed. A bare click is all the handler under
  // test listens for.
  const ONE = {
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

  it("reports a clicked node, so the form below the canvas can follow it", async () => {
    // One selected entry, two ways to set it: this row in the left list, or
    // this node on the graph.
    mockFetch(ONE);
    const onSelectNode = vi.fn();
    const { container } = render(
      <RelationGraph
        scopeType="franchise"
        scopeId="f1"
        kinds={[]}
        onSelectNode={onSelectNode}
      />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll(".react-flow__node")).toHaveLength(1),
    );

    fireEvent.click(container.querySelector(".react-flow__node"));

    await waitFor(() => expect(onSelectNode).toHaveBeenCalledWith("anime:a"));
  });

  it("does not report a ghost, which is not one of the scope's entries", async () => {
    // A ghost click moves the lens to its franchise instead; selecting it
    // would point the form at an entry the scope does not hold.
    mockFetch({
      nodes: [{ ...ONE.nodes[0], in_scope: false, franchise_id: "f2" }],
      edges: [],
    });
    const onSelectNode = vi.fn();
    const onPickGhostFranchise = vi.fn();
    const { container } = render(
      <RelationGraph
        scopeType="franchise"
        scopeId="f1"
        kinds={[]}
        onSelectNode={onSelectNode}
        onPickGhostFranchise={onPickGhostFranchise}
      />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll(".react-flow__node")).toHaveLength(1),
    );

    fireEvent.click(container.querySelector(".react-flow__node"));

    await waitFor(() => expect(onPickGhostFranchise).toHaveBeenCalledWith("f2"));
    expect(onSelectNode).not.toHaveBeenCalled();
  });
});
