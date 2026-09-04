// Frontend: tests for the dashboard card's arc_ch chapter stepper.
//
// arc_fin/ch_fin_in_arc are the authoritative two-stage cursor; ch_fin and
// arc_total are derived server-side from them on every write (see
// app/services/domain/novel_units.py derive_novel_progress). A stepper that
// PATCHes ch_fin (or arc_fin) alone gets silently recomputed away by the
// very request that sent it. The chapter stepper must instead compute the
// next cursor with arcStep and PATCH both fields together.
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import NovelDashboardCard from "./NovelDashboardCard";
import { ToastProvider } from "../../hooks/useToast";

function renderCard(novel, onProgressChange = vi.fn()) {
  render(
    <MemoryRouter>
      <ToastProvider>
        <NovelDashboardCard novel={novel} isAdmin onProgressChange={onProgressChange} />
      </ToastProvider>
    </MemoryRouter>,
  );
  return onProgressChange;
}

describe("NovelDashboardCard — arc_ch chapter stepper", () => {
  const units = [
    { unit_kind: "arc", position: 1, ch_count: 100 },
    { unit_kind: "arc", position: 2, ch_count: 112 },
  ];

  it("steps a chapter forward and PATCHes both arc_fin and ch_fin_in_arc together", () => {
    const novel = {
      system_id: "n1",
      progress_display: "arc_ch",
      units,
      arc_fin: 1,
      ch_fin_in_arc: 101,
      arc_total: 2,
      ch_total: 212,
      ch_fin: 201,
    };
    const onProgressChange = renderCard(novel);

    fireEvent.click(screen.getByLabelText("One chapter forward"));

    expect(onProgressChange).toHaveBeenCalledWith(
      "n1",
      { arc_fin: 1, ch_fin_in_arc: 102 },
      { arc_fin: 1, ch_fin_in_arc: 101 },
    );
  });

  it("rolls over into the next arc when the step crosses the arc's chapter count", () => {
    const novel = {
      system_id: "n1",
      progress_display: "arc_ch",
      units,
      arc_fin: 1,
      ch_fin_in_arc: 111,
      arc_total: 2,
      ch_total: 212,
      ch_fin: 211,
    };
    const onProgressChange = renderCard(novel);

    fireEvent.click(screen.getByLabelText("One chapter forward"));

    expect(onProgressChange).toHaveBeenCalledWith(
      "n1",
      { arc_fin: 2, ch_fin_in_arc: 0 },
      { arc_fin: 1, ch_fin_in_arc: 111 },
    );
  });
});

describe("NovelDashboardCard — non-derived paths are unaffected", () => {
  it("still PATCHes ch_fin directly for a novel with no arc rows", () => {
    const novel = {
      system_id: "n2",
      progress_display: "ch",
      units: [],
      ch_fin: 5,
      ch_total: 300,
    };
    const onProgressChange = renderCard(novel);

    fireEvent.click(screen.getByLabelText("One chapter forward"));

    expect(onProgressChange).toHaveBeenCalledWith(
      "n2",
      { ch_fin: 6 },
      { ch_fin: 5 },
    );
  });

  it("still PATCHes vol_fin directly for the volume stepper", () => {
    const novel = {
      system_id: "n3",
      progress_display: "vol_original",
      units: [],
      vol_fin: 2,
      vol_total_original: 10,
    };
    const onProgressChange = renderCard(novel);

    fireEvent.click(screen.getByLabelText("One volume forward"));

    expect(onProgressChange).toHaveBeenCalledWith(
      "n3",
      { vol_fin: 3 },
      { vol_fin: 2 },
    );
  });
});
