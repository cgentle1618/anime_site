// Frontend: tests for the two-stage arc/chapter tracker row and the
// arc-less flat chapter fallback (Decision G: a Web novel with no arc rows
// yet still needs a working chapter stepper).
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NovelTrackerBlock from "./NovelTrackerBlock";

const noop = () => {};

function baseProps(overrides = {}) {
  return {
    novel: { system_id: "n1", type: "Web", units: [] },
    isAdmin: true,
    onChChange: noop,
    onVolChange: noop,
    onArcProgressChange: noop,
    onStatusChange: noop,
    onRatingChange: noop,
    onReadNextChange: noop,
    onToRerereadChange: noop,
    onProgressDisplayChange: noop,
    ...overrides,
  };
}

describe("NovelTrackerBlock — arc-less flat chapter stepper", () => {
  it("renders the flat Chapters row and steps it via onChChange when there are no arc rows", () => {
    const onChChange = vi.fn();
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: { system_id: "n1", type: "Web", units: [], ch_fin: 5, ch_total: 300 },
          onChChange,
        })}
      />,
    );

    expect(screen.getByText("Chapters")).toBeInTheDocument();
    expect(screen.queryByText("Arc / Chapter")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Next chapter"));
    expect(onChChange).toHaveBeenCalledWith(6);
  });
});

describe("NovelTrackerBlock — two-stage arc/chapter stepper", () => {
  const units = [
    { unit_kind: "arc", position: 1, ch_count: 100 },
    { unit_kind: "arc", position: 2, ch_count: 112 },
  ];

  it("renders the Arc / Chapter row instead of separate Arc and Chapter rows", () => {
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: { system_id: "n1", type: "Web", units, arc_fin: 1, ch_fin_in_arc: 101 },
        })}
      />,
    );

    expect(screen.getByText("Arc / Chapter")).toBeInTheDocument();
    expect(screen.queryByText("Chapters")).not.toBeInTheDocument();
    expect(screen.queryByText("Arcs")).not.toBeInTheDocument();
  });

  it("steps up across an arc boundary via onArcProgressChange", () => {
    const onArcProgressChange = vi.fn();
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: { system_id: "n1", type: "Web", units, arc_fin: 0, ch_fin_in_arc: 100 },
          onArcProgressChange,
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText("Next chapter"));
    expect(onArcProgressChange).toHaveBeenCalledWith({ arc_fin: 1, ch_fin_in_arc: 1 });
  });

  it("does not clamp ch_fin_in_arc when arc_fin is already at the last recorded arc (Decision D)", () => {
    const onArcProgressChange = vi.fn();
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: { system_id: "n1", type: "Web", units, arc_fin: 2, ch_fin_in_arc: 5 },
          onArcProgressChange,
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText("Next chapter"));
    expect(onArcProgressChange).toHaveBeenCalledWith({ arc_fin: 2, ch_fin_in_arc: 6 });
  });

  it("does not go negative when stepping down from arc_fin 0, ch_fin_in_arc 0", () => {
    const onArcProgressChange = vi.fn();
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: { system_id: "n1", type: "Web", units, arc_fin: 0, ch_fin_in_arc: 0 },
          onArcProgressChange,
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText("Previous chapter"));
    expect(onArcProgressChange).not.toHaveBeenCalled();
  });
});

// A Light Novel and a Novel are counted in volumes. The chapter and arc
// columns are meaningless for them (the server clears them), so no chapter
// row may render - not even an empty one.
describe("NovelTrackerBlock — volume-only types have no chapter row", () => {
  it.each(["Light Novel", "Novel"])(
    "renders Volumes but no chapter row for %s",
    (type) => {
      render(
        <NovelTrackerBlock
          {...baseProps({
            novel: {
              system_id: "n1",
              type,
              units: [],
              vol_fin: 3,
              vol_total_original: 11,
            },
          })}
        />,
      );

      expect(screen.getByText("Volumes")).toBeInTheDocument();
      expect(screen.queryByText("Chapters")).not.toBeInTheDocument();
      expect(screen.queryByText("Arc / Chapter")).not.toBeInTheDocument();
    },
  );

  it("hides the chapter row even when stale chapter values are still on the row", () => {
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: {
            system_id: "n1",
            type: "Light Novel",
            units: [],
            ch_fin: 0,
            ch_total: 110,
          },
        })}
      />,
    );

    expect(screen.queryByText("Chapters")).not.toBeInTheDocument();
    expect(screen.queryByText("110")).not.toBeInTheDocument();
  });

  it("hides the two-stage row too when arc rows arrived from a Pull", () => {
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: {
            system_id: "n1",
            type: "Novel",
            units: [{ unit_kind: "arc", position: 1, ch_count: 100 }],
            arc_fin: 0,
            ch_fin_in_arc: 5,
          },
        })}
      />,
    );

    expect(screen.queryByText("Arc / Chapter")).not.toBeInTheDocument();
  });

  it("still renders the chapter row for Other, which may count chapters", () => {
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: { system_id: "n1", type: "Other", units: [], ch_fin: 4, ch_total: 20 },
        })}
      />,
    );

    expect(screen.getByText("Chapters")).toBeInTheDocument();
  });
});

// A web novel is read in chapters. Its volume columns are kept (a print run
// may exist) but never rendered, and its progress-display choice is limited
// to the counters it actually has.
describe("NovelTrackerBlock — Web hides volumes", () => {
  it("renders no Volumes row for a Web novel", () => {
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: {
            system_id: "n1",
            type: "Web",
            units: [],
            vol_fin: 3,
            vol_total_tw: 11,
            ch_fin: 5,
            ch_total: 300,
          },
        })}
      />,
    );

    expect(screen.queryByText("Volumes")).not.toBeInTheDocument();
    expect(screen.getByText("Chapters")).toBeInTheDocument();
  });

  it("still renders Volumes for Other, which may count either", () => {
    render(
      <NovelTrackerBlock
        {...baseProps({ novel: { system_id: "n1", type: "Other", units: [] } })}
      />,
    );

    expect(screen.getByText("Volumes")).toBeInTheDocument();
    expect(screen.getByText("Chapters")).toBeInTheDocument();
  });

  it("offers only the chapter counters in the progress-display select", () => {
    render(
      <NovelTrackerBlock
        {...baseProps({ novel: { system_id: "n1", type: "Web", units: [] } })}
      />,
    );

    const values = [...screen.getByLabelText("Progress display").options].map(
      (o) => o.value,
    );
    expect(values).toEqual(["", "ch"]);
  });
});

describe("NovelTrackerBlock — the whole-arc stepper", () => {
  const units = [
    { unit_kind: "arc", position: 1, ch_count: 100, unit_key: "", name_cn: "小丑" },
    { unit_kind: "arc", position: 2, ch_count: 112, unit_key: "", name_cn: "序曲" },
    { unit_kind: "arc", position: 3, ch_count: 90, unit_key: "", name_cn: "詭秘" },
  ];

  function webNovel(overrides = {}) {
    return {
      system_id: "n1",
      type: "Web",
      units,
      arc_fin: 1,
      ch_fin_in_arc: 40,
      progress_display: "arc",
      ...overrides,
    };
  }

  it("renders the Arcs row with the current arc's position and name", () => {
    render(<NovelTrackerBlock {...baseProps({ novel: webNovel() })} />);

    expect(screen.getByText("Arcs")).toBeInTheDocument();
    expect(screen.queryByText("Arc / Chapter")).not.toBeInTheDocument();
    expect(screen.queryByText("Chapters")).not.toBeInTheDocument();
    // The count and the total live in sibling spans, so match on the row's
    // combined text rather than on one node.
    const row = screen.getByText("Arcs").parentElement;
    expect(row.textContent.replace(/\s+/g, " ")).toMatch(/arc 2\s*\/ 3/);
    expect(row.textContent).toMatch(/序曲/);
  });

  it("steps a whole arc and resets the in-arc cursor", () => {
    const onArcProgressChange = vi.fn();
    render(
      <NovelTrackerBlock
        {...baseProps({ novel: webNovel(), onArcProgressChange })}
      />,
    );

    fireEvent.click(screen.getByLabelText("Next arc"));
    expect(onArcProgressChange).toHaveBeenCalledWith({
      arc_fin: 2,
      ch_fin_in_arc: 0,
    });
  });

  it("steps back a whole arc", () => {
    const onArcProgressChange = vi.fn();
    render(
      <NovelTrackerBlock
        {...baseProps({ novel: webNovel(), onArcProgressChange })}
      />,
    );

    fireEvent.click(screen.getByLabelText("Previous arc"));
    expect(onArcProgressChange).toHaveBeenCalledWith({
      arc_fin: 0,
      ch_fin_in_arc: 0,
    });
  });

  it("offers all three chapter counters once arc rows exist", () => {
    render(<NovelTrackerBlock {...baseProps({ novel: webNovel() })} />);

    const values = [...screen.getByLabelText("Progress display").options].map(
      (o) => o.value,
    );
    expect(values).toEqual(["", "ch", "arc", "arc_ch"]);
  });
});

describe("NovelTrackerBlock — flat chapters are read-only when arcs govern", () => {
  const units = [{ unit_kind: "arc", position: 1, ch_count: 100 }];

  it("shows the derived pair with no steppers when 'ch' is chosen with arc rows", () => {
    render(
      <NovelTrackerBlock
        {...baseProps({
          novel: {
            system_id: "n1",
            type: "Web",
            units,
            arc_fin: 0,
            ch_fin_in_arc: 30,
            ch_fin: 30,
            ch_total: 100,
            progress_display: "ch",
          },
        })}
      />,
    );

    expect(screen.getByText("Chapters")).toBeInTheDocument();
    // ch_fin is derived from the arc rows, so editing it here would fight the
    // derivation - the arc row is where it is edited.
    expect(screen.queryByLabelText("Next chapter")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chapters finished")).not.toBeInTheDocument();
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });
});
