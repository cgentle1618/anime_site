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
