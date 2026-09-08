// Frontend: tests for one node on the relations canvas.
//
// The handles are the reason this file exists. React Flow resolves an edge's
// endpoints from the mounted handle carrying that id, so a node that stops
// rendering its handles takes every attached relation line off the canvas with
// it - which is exactly what a read-only graph must not do.
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";

import RelationNode from "./RelationNode";

const DATA = {
  key: "anime:a",
  media_type: "anime",
  type_label: "Anime",
  display_name: "Fate/Zero",
  in_scope: true,
  missing: false,
};

function setup(props = {}) {
  const { container } = render(
    <ReactFlowProvider>
      <RelationNode data={DATA} selected={false} {...props} />
    </ReactFlowProvider>,
  );
  return container;
}

describe("RelationNode", () => {
  it("renders all four handles by default", () => {
    expect(setup().querySelectorAll(".react-flow__handle")).toHaveLength(4);
  });

  it("keeps all four handles mounted when not connectable", () => {
    // Unmounting them would leave every edge on this node unroutable.
    const container = setup({ isConnectable: false });
    expect(container.querySelectorAll(".react-flow__handle")).toHaveLength(4);
  });

  it("hides the handles and stops them taking a pointer when not connectable", () => {
    const handles = setup({ isConnectable: false }).querySelectorAll(
      ".react-flow__handle",
    );
    for (const handle of handles) {
      expect(handle.className).toContain("!opacity-0");
      expect(handle.className).toContain("!pointer-events-none");
    }
  });

  it("still names the entry when not connectable", () => {
    setup({ isConnectable: false });
    expect(screen.getByText("Fate/Zero")).toBeInTheDocument();
  });
});
