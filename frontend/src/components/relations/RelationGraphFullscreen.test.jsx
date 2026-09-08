// Frontend: tests for the toolbar's Expand / Collapse button.
//
// Expanding is a pure class swap on the wrapper - no portal, no remount - so
// what matters here is that the swap happens in both directions, that Escape
// is wired to it, and that the body scroll lock it takes is always given back,
// including when the page unmounts while still expanded. A canvas that left
// `overflow: hidden` behind would freeze the whole site.
import { render, screen, waitFor } from "@testing-library/react";
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

const node = (key) => ({
  key,
  entry_id: key.split(":")[1],
  media_type: "anime",
  type_label: "Anime",
  display_name: key,
  in_scope: true,
});

const GRAPH = { nodes: [node("anime:a"), node("anime:b")], edges: [] };

function mockFetch(graph = GRAPH) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(graph) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The button is icon-only, so it is addressed by its accessible name.
const expandButton = () => screen.getByRole("button", { name: /expand/i });
const collapseButton = () => screen.getByRole("button", { name: /collapse/i });

async function renderGraph(props = { readOnly: true }) {
  mockFetch();
  const view = render(
    <RelationGraph scopeType="series" scopeId="s1" {...props} />,
  );
  await waitFor(() => expect(expandButton()).toBeInTheDocument());
  return view;
}

describe("RelationGraph fullscreen", () => {
  it("offers Expand on a read-only canvas", async () => {
    // The three group pages mount the graph read-only, and they are the reason
    // the button exists: viewing is exactly where the 36rem box is tightest.
    await renderGraph();
    expect(expandButton()).toBeEnabled();
  });

  it("offers Expand on the editable canvas too", async () => {
    await renderGraph({ kinds: [] });
    expect(expandButton()).toBeEnabled();
  });

  it("swaps the wrapper to a viewport overlay and back", async () => {
    const user = userEvent.setup();
    const { container } = await renderGraph();
    const wrapper = container.firstChild;

    expect(wrapper.className).not.toMatch(/fixed/);

    await user.click(expandButton());
    expect(wrapper.className).toMatch(/fixed/);
    expect(wrapper.className).toMatch(/inset-0/);

    // Collapsing has to restore the flow position, or the graph would sit
    // pinned over the page with no way back to the tab it belongs to.
    await user.click(collapseButton());
    expect(wrapper.className).not.toMatch(/fixed/);
    expect(screen.queryByRole("button", { name: /collapse/i })).toBeNull();
  });

  it("gives the canvas the full height while expanded", async () => {
    const user = userEvent.setup();
    const { container } = await renderGraph();
    // The canvas box is the wrapper's last element child in the collapsed
    // tree; addressing it by its fixed height is what makes the swap visible.
    const canvas = container.querySelector(".h-\\[36rem\\]");
    expect(canvas).not.toBeNull();

    await user.click(expandButton());
    expect(container.querySelector(".h-\\[36rem\\]")).toBeNull();
    expect(container.querySelector(".flex-1")).not.toBeNull();
  });

  it("collapses on Escape", async () => {
    const user = userEvent.setup();
    const { container } = await renderGraph();
    await user.click(expandButton());
    expect(container.firstChild.className).toMatch(/fixed/);

    await user.keyboard("{Escape}");
    expect(container.firstChild.className).not.toMatch(/fixed/);
  });

  it("ignores Escape while collapsed", async () => {
    // The listener is bound only while expanded, so a stray Escape on the page
    // cannot reach a graph that is not showing.
    const user = userEvent.setup();
    const { container } = await renderGraph();
    await user.keyboard("{Escape}");
    expect(container.firstChild.className).not.toMatch(/fixed/);
  });

  it("locks and restores the page scroll", async () => {
    const user = userEvent.setup();
    await renderGraph();
    expect(document.body.style.overflow).toBe("");

    await user.click(expandButton());
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(collapseButton());
    expect(document.body.style.overflow).toBe("");
  });

  it("restores the page scroll if it unmounts while expanded", async () => {
    // Navigating away from the tab while expanded - a route change unmounts
    // the graph without ever running the collapse handler.
    const user = userEvent.setup();
    const { unmount } = await renderGraph();
    await user.click(expandButton());
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
