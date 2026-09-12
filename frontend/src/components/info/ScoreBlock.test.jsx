// ScoreBlock shows scores, and nothing about when the entry was edited.
//
// It used to carry a "Last updated" figure fed by the entry's `updated_at`.
// That timestamp is a fact about the catalogue row rather than about the
// work, nobody reads it off a detail page, and it was the only thing the old
// `system_info` field group actually withheld - so the figure went and the
// gate went with it. The component takes no timestamp prop at all now, which
// is why there is nothing here about permissions.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ScoreBlock from "./ScoreBlock";

describe("ScoreBlock", () => {
  it("renders the scores it is given", () => {
    render(<ScoreBlock malScore="8.1" malRank={3} anilistScore="82" />);
    expect(screen.getByText("8.1")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
  });

  it("shows no updated-at figure, for any viewer", () => {
    render(<ScoreBlock malScore="8.1" />);
    expect(screen.queryByText("Last updated")).not.toBeInTheDocument();
  });

  // The mirror: a timestamp handed in by a stale caller must not resurrect
  // the figure. The prop is gone, so passing one has to be inert rather than
  // quietly rendering again.
  it("ignores an updatedAt prop a stale caller still passes", () => {
    render(<ScoreBlock malScore="8.1" updatedAt="2026-09-01T14:32:07" />);
    expect(screen.queryByText("Last updated")).not.toBeInTheDocument();
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });

  it("renders both AniList ranks with a # prefix", () => {
    render(
      <ScoreBlock
        malScore="8.1"
        malRank={3}
        anilistScore={90}
        anilistRank={5}
        anilistPopularityRank={11}
      />,
    );
    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.getByText("#11")).toBeInTheDocument();
  });

  it("shows an em dash for a title AniList has not ranked", () => {
    render(<ScoreBlock malScore="8.1" malRank={3} anilistScore={82} />);
    // score present, both ranks absent - the common case for an obscure entry
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
