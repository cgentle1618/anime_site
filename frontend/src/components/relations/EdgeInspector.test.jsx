// Frontend: tests for the selected-edge panel.
//
// The panel is rendered on two very different surfaces - the admin Relations
// page, where it is the only way to retype or remove a relation, and the group
// hubs, where nothing may write. So the tests care most about which controls
// exist in each mode.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EdgeInspector from "./EdgeInspector";

const KINDS = [
  { key: "prequel", label: "Prequel", symmetric: false },
  { key: "sequel", label: "Sequel", symmetric: false },
  { key: "adaptation", label: "Adaptation", symmetric: false },
  { key: "alternative", label: "Alternative", symmetric: true },
];

const EDGE = {
  system_id: "e1",
  relation_type: "sequel",
  label: "Sequel",
  sourceName: "Fate/Zero",
  targetName: "Fate/stay night",
  remark: "adapts vols 1-7",
};

function setup(props = {}) {
  const onPatch = vi.fn();
  const onDelete = vi.fn();
  render(
    <EdgeInspector
      edge={EDGE}
      kinds={KINDS}
      onPatch={onPatch}
      onDelete={onDelete}
      onClose={vi.fn()}
      {...props}
    />,
  );
  return { onPatch, onDelete };
}

describe("EdgeInspector", () => {
  it("offers the kind, remark and delete controls by default", () => {
    setup();
    expect(screen.getByRole("combobox")).toHaveValue("sequel");
    expect(screen.getByDisplayValue("adapts vols 1-7")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove relation/i }),
    ).toBeInTheDocument();
  });

  it("reads the relation as a sentence naming both entries and the kind", () => {
    setup();
    // By element rather than by text: "Sequel" is also one of the kind
    // options, so a bare getByText would match two nodes.
    const sentence = screen.getByText("Fate/Zero").closest("p");
    expect(sentence).toHaveTextContent(
      "Fate/Zero is the Sequel of Fate/stay night",
    );
  });

  it("swaps which entry is the origin, keeping the kind", async () => {
    // The only way to turn a kind with no second name around: Adaptation has
    // no Prequel-style inverse to retype it as.
    const { onPatch } = setup({ edge: { ...EDGE, relation_type: "adaptation" } });
    await userEvent.click(screen.getByRole("button", { name: /^swap/i }));
    expect(onPatch).toHaveBeenCalledWith({ swap: true });
  });

  it("refuses to swap a symmetric kind, which reads the same both ways", () => {
    setup({
      edge: { ...EDGE, relation_type: "alternative", label: "Alternative" },
    });
    expect(screen.getByRole("button", { name: /^swap/i })).toBeDisabled();
  });

  it("drops every writing control when read-only", () => {
    setup({ readOnly: true });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove relation/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^swap/i })).not.toBeInTheDocument();
  });

  it("still shows the sentence and the remark when read-only", () => {
    setup({ readOnly: true });
    expect(screen.getByText("Fate/Zero")).toBeInTheDocument();
    expect(screen.getByText("adapts vols 1-7")).toBeInTheDocument();
  });

  it("omits the remark heading when read-only and there is no remark", () => {
    setup({ readOnly: true, edge: { ...EDGE, remark: null } });
    expect(screen.queryByText(/remark/i)).not.toBeInTheDocument();
  });
});
