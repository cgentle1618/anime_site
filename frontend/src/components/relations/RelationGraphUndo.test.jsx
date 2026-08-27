// Frontend: tests for the undo button's presence and gating.
//
// The reversal rules themselves are unit-tested in lib/relationUndo; what is
// worth checking here is that the button exists only where writing is
// possible, and never offers to undo nothing.
import { render, screen, waitFor } from "@testing-library/react";

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

function mockFetch() {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_GRAPH) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RelationGraph undo button", () => {
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
    mockFetch();
    render(<RelationGraph readOnly scopeType="series" scopeId="s1" />);
    // The family filters prove the toolbar rendered, so a missing Undo is a
    // real absence rather than a canvas that never mounted.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /timeline/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("asks the graph endpoint for the right scope key", async () => {
    const fetchMock = mockFetch();
    render(<RelationGraph readOnly scopeType="series" scopeId="s1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("series_id=s1");
  });
});
