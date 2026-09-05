// Frontend: the arc/chapter inputs exist only for the types that count them.
// A Light Novel and a Novel count volumes; derive_novel_progress() clears
// their chapter and arc columns on save, so offering the inputs would invite
// an edit that is silently discarded.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NovelModifyTab from "./NovelModifyTab";

// NovelNotes fetches on mount and is not what these tests are about.
vi.mock("../detail/NovelNotes", () => ({
  default: () => <div data-testid="novel-notes" />,
}));

function props(type) {
  return {
    franchiseCollections: [],
    cnvf: { type, units: [] },
    unv: () => {},
    allFranchises: [],
    seriesItemsForNovel: [],
    editingItem: { system_id: "n1" },
    ribbonSection: null,
    sources: [],
  };
}

const CHAPTER_FIELDS = ["Arc Total", "Arc Finished", "Ch Total", "Ch Finished"];
const VOLUME_FIELDS = ["Total Volumes (JP/KR)", "Vol Total (TW)", "Vol Finished"];

describe("NovelModifyTab — arc and chapter inputs follow the type", () => {
  it.each(["Light Novel", "Novel"])("hides them for %s", (type) => {
    render(<NovelModifyTab {...props(type)} />);
    for (const label of CHAPTER_FIELDS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it.each(["Light Novel", "Novel"])("keeps the volume inputs for %s", (type) => {
    render(<NovelModifyTab {...props(type)} />);
    for (const label of VOLUME_FIELDS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it.each(["Web", "Other"])("shows them for %s", (type) => {
    render(<NovelModifyTab {...props(type)} />);
    for (const label of CHAPTER_FIELDS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows them for a novel whose type is not set yet", () => {
    render(<NovelModifyTab {...props("")} />);
    expect(screen.getByText("Ch Total")).toBeInTheDocument();
  });
});

// A web novel is read in chapters. Its volume columns are kept but never
// edited here, and its progress-display choice narrows to what it can render.
describe("NovelModifyTab — volume inputs follow the type", () => {
  it("hides the volume inputs for Web", () => {
    render(<NovelModifyTab {...props("Web")} />);
    for (const label of VOLUME_FIELDS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("keeps the chapter inputs for Web", () => {
    render(<NovelModifyTab {...props("Web")} />);
    expect(screen.getByText("Ch Total")).toBeInTheDocument();
  });

  it.each(["Light Novel", "Other"])("keeps the volume inputs for %s", (type) => {
    render(<NovelModifyTab {...props(type)} />);
    expect(screen.getByText("Vol Finished")).toBeInTheDocument();
  });
});

describe("NovelModifyTab — the progress-display select is built per type", () => {
  const values = () =>
    [...screen.getByLabelText("Progress display").options].map((o) => o.value);

  it("offers only volume counters for a Light Novel", () => {
    render(<NovelModifyTab {...props("Light Novel")} />);
    expect(values()).toEqual(["", "vol_original", "vol_tw"]);
  });

  it("offers only chapters for a Web novel with no arc rows", () => {
    render(<NovelModifyTab {...props("Web")} />);
    expect(values()).toEqual(["", "ch"]);
  });

  it("adds the arc counters once the entry has arc rows", () => {
    const p = props("Web");
    p.cnvf.units = [{ unit_kind: "arc", position: 1, ch_count: 100 }];
    render(<NovelModifyTab {...p} />);
    expect(values()).toEqual(["", "ch", "arc", "arc_ch"]);
  });

  it("keeps a stored value the list no longer offers, marked legacy", () => {
    const p = props("Web");
    p.cnvf.progress_display = "vol_tw";
    render(<NovelModifyTab {...p} />);
    expect(values()).toContain("vol_tw");
  });
});
