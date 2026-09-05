import { describe, expect, it } from "vitest";
import {
  NOVEL_UNIT_KINDS_BY_TYPE,
  NOVEL_VOLUME_ONLY_TYPES,
  arcStep,
  countsChapters,
  countsVolumes,
  progressDisplayOptions,
  wholeArcStep,
  effectiveProgressDisplay,
  kindsForType,
  unitDisplayKey,
} from "./novelUnits";

describe("unitDisplayKey", () => {
  it("uses the explicit key when there is one", () => {
    expect(unitDisplayKey("volume", 1, "第一卷")).toBe("第一卷");
  });

  it("generates a key from kind and position otherwise", () => {
    expect(unitDisplayKey("volume", 1, "")).toBe("Vol 1");
    expect(unitDisplayKey("arc", 2, null)).toBe("Arc 2");
    expect(unitDisplayKey("story", 3, "   ")).toBe("Story 3");
    expect(unitDisplayKey("chapter", 4, undefined)).toBe("Ch 4");
  });

  it("keeps a fractional position", () => {
    expect(unitDisplayKey("volume", 1.5, null)).toBe("Vol 1.5");
  });
});

describe("kindsForType", () => {
  it("maps each novel type to its kinds", () => {
    expect(kindsForType("Light Novel")).toEqual(["volume"]);
    expect(kindsForType("Novel")).toEqual(["volume"]);
    expect(kindsForType("Web")).toEqual(["arc"]);
    expect(kindsForType("Other")).toEqual(["volume", "story", "chapter"]);
  });

  it("falls back to volume for an unknown type", () => {
    expect(kindsForType(null)).toEqual(["volume"]);
  });
});

describe("arcStep", () => {
  const arcs = [{ ch_count: 100 }, { ch_count: 112 }];

  it("steps forward inside the current arc", () => {
    expect(arcStep(arcs, 1, 100, 1)).toEqual({ arc_fin: 1, ch_fin_in_arc: 101 });
  });

  it("rolls into the next arc when the current one completes", () => {
    expect(arcStep(arcs, 1, 111, 1)).toEqual({ arc_fin: 2, ch_fin_in_arc: 0 });
  });

  it("borrows from the previous arc when stepping back past zero", () => {
    expect(arcStep(arcs, 1, 0, -1)).toEqual({ arc_fin: 0, ch_fin_in_arc: 99 });
  });

  it("clamps at the very beginning", () => {
    expect(arcStep(arcs, 0, 0, -1)).toEqual({ arc_fin: 0, ch_fin_in_arc: 0 });
  });

  it("keeps counting past the last recorded arc", () => {
    expect(arcStep([{ ch_count: 100 }], 1, 40, 1)).toEqual({
      arc_fin: 1,
      ch_fin_in_arc: 41,
    });
  });

  // Mirrors the Python normalize_arc_progress arithmetic (app side) — see
  // task-10 ruling 2. Uses a three-arc list so a single step can cross more
  // than one boundary in each direction.
  const threeArcs = [{ ch_count: 10 }, { ch_count: 5 }, { ch_count: 20 }];

  it("crosses more than one boundary going up: rolls through the too-short arc 2 into arc 3", () => {
    // arc_fin 0 (reading arc 1), 8/10 chapters in; +9 finishes arc 1's
    // remaining 2, all of arc 2 (5), landing 2 chapters into arc 3.
    expect(arcStep(threeArcs, 0, 8, 9)).toEqual({ arc_fin: 2, ch_fin_in_arc: 2 });
  });

  it("crosses more than one boundary going down: borrows back through all of arc 2 into arc 1", () => {
    // The exact reverse of the case above.
    expect(arcStep(threeArcs, 2, 2, -9)).toEqual({ arc_fin: 0, ch_fin_in_arc: 8 });
  });

  it("clamps at zero even when the downward step would cross multiple boundaries", () => {
    expect(arcStep(threeArcs, 1, 0, -100)).toEqual({ arc_fin: 0, ch_fin_in_arc: 0 });
  });

  it("the anchor example: arc 1 has 100 chapters, arc 2 has 112", () => {
    const arcs = [{ ch_count: 100 }, { ch_count: 112 }];
    // 100 chapters into arc 1, +1 rolls into arc 2 at chapter 1.
    expect(arcStep(arcs, 0, 100, 1)).toEqual({ arc_fin: 1, ch_fin_in_arc: 1 });
    // arc 2 = 101/112, closing it (+11) lands exactly at arc 2 finished.
    expect(arcStep(arcs, 1, 101, 11)).toEqual({ arc_fin: 2, ch_fin_in_arc: 0 });
  });
});

describe("effectiveProgressDisplay", () => {
  const arcUnits = [{ unit_kind: "arc", position: 1, ch_count: 100 }];
  const volUnits = [{ unit_kind: "volume", position: 1 }];
  const storyUnits = [{ unit_kind: "story", position: 1 }];
  const chapterUnits = [{ unit_kind: "chapter", position: 1 }];

  it("Web with arc rows renders arc_ch", () => {
    expect(effectiveProgressDisplay({ type: "Web", units: arcUnits })).toBe("arc_ch");
  });

  it("Web without arc rows renders ch", () => {
    expect(effectiveProgressDisplay({ type: "Web", units: [] })).toBe("ch");
    expect(effectiveProgressDisplay({ type: "Web", units: volUnits })).toBe("ch");
  });

  it("Light Novel and Novel render volumes", () => {
    expect(effectiveProgressDisplay({ type: "Light Novel", units: [] })).toBe(
      "vol_original",
    );
    expect(effectiveProgressDisplay({ type: "Novel", units: [] })).toBe(
      "vol_original",
    );
  });

  it("Other with volume rows (or no rows) renders volumes", () => {
    expect(effectiveProgressDisplay({ type: "Other", units: volUnits })).toBe(
      "vol_original",
    );
    expect(effectiveProgressDisplay({ type: "Other", units: [] })).toBe(
      "vol_original",
    );
  });

  it("Other with story or chapter rows renders ch", () => {
    expect(effectiveProgressDisplay({ type: "Other", units: storyUnits })).toBe(
      "ch",
    );
    expect(effectiveProgressDisplay({ type: "Other", units: chapterUnits })).toBe(
      "ch",
    );
  });

  // Superseded rule: a stored progress_display used to win outright, whatever
  // the type. Now that the dropdown is built per type, an override the type
  // cannot render (a volume counter on Web, a chapter counter on a light
  // novel) would show a row that does not exist, so the type has the last
  // word. See "the override must suit the type" below.
  it("a stored progress_display wins whenever the type supports it", () => {
    expect(
      effectiveProgressDisplay({
        type: "Web",
        units: arcUnits,
        progress_display: "ch",
      }),
    ).toBe("ch");
    expect(
      effectiveProgressDisplay({
        type: "Light Novel",
        units: [],
        progress_display: "vol_tw",
      }),
    ).toBe("vol_tw");
  });
});

describe("countsChapters", () => {
  it("is false for the volume-only types", () => {
    expect(countsChapters({ type: "Light Novel" })).toBe(false);
    expect(countsChapters({ type: "Novel" })).toBe(false);
  });

  it("is true for Web and Other", () => {
    expect(countsChapters({ type: "Web" })).toBe(true);
    expect(countsChapters({ type: "Other" })).toBe(true);
  });

  it("is true for an unset or unrecognised type, matching the server", () => {
    expect(countsChapters({})).toBe(true);
    expect(countsChapters({ type: "Serial" })).toBe(true);
    expect(countsChapters(null)).toBe(true);
  });
});

describe("NOVEL_VOLUME_ONLY_TYPES", () => {
  it("is derived from the kind map, not typed a second time", () => {
    expect([...NOVEL_VOLUME_ONLY_TYPES].sort()).toEqual(["Light Novel", "Novel"]);
    for (const type of NOVEL_VOLUME_ONLY_TYPES) {
      expect(NOVEL_UNIT_KINDS_BY_TYPE[type]).toEqual(["volume"]);
    }
  });
});

describe("countsVolumes", () => {
  it("is false for Web, whose volume columns are kept but never shown", () => {
    expect(countsVolumes({ type: "Web" })).toBe(false);
  });

  it("is true for every other type", () => {
    for (const type of ["Light Novel", "Novel", "Other", "Serial", undefined]) {
      expect(countsVolumes({ type })).toBe(true);
    }
    expect(countsVolumes(null)).toBe(true);
  });
});

describe("progressDisplayOptions", () => {
  const values = (novel) => progressDisplayOptions(novel).map((o) => o.value);
  const arcs = [{ unit_kind: "arc", position: 1, ch_count: 100 }];

  it("offers only volume counters for the volume-only types", () => {
    expect(values({ type: "Light Novel", units: [] })).toEqual([
      "",
      "vol_original",
      "vol_tw",
    ]);
    expect(values({ type: "Novel", units: [] })).toEqual([
      "",
      "vol_original",
      "vol_tw",
    ]);
  });

  it("offers only chapters for a Web novel with no arc rows yet", () => {
    expect(values({ type: "Web", units: [] })).toEqual(["", "ch"]);
  });

  it("adds the arc counters once a Web novel has arc rows", () => {
    expect(values({ type: "Web", units: arcs })).toEqual([
      "",
      "ch",
      "arc",
      "arc_ch",
    ]);
  });

  it("never offers a volume counter for Web", () => {
    expect(values({ type: "Web", units: arcs })).not.toContain("vol_tw");
    expect(values({ type: "Web", units: arcs })).not.toContain("vol_original");
  });

  it("offers volumes and chapters for Other and for an unset type", () => {
    const expected = ["", "vol_original", "vol_tw", "ch"];
    expect(values({ type: "Other", units: [] })).toEqual(expected);
    expect(values({ units: [] })).toEqual(expected);
  });

  it("labels the blank option with what it derives to", () => {
    const [blank] = progressDisplayOptions({ type: "Web", units: [] });
    expect(blank.value).toBe("");
    expect(blank.label).toMatch(/default/i);
    expect(blank.label).toMatch(/CH/i);
  });

  it("every option carries a label", () => {
    for (const o of progressDisplayOptions({ type: "Web", units: arcs })) {
      expect(o.label).toBeTruthy();
    }
  });
});

describe("effectiveProgressDisplay — the override must suit the type", () => {
  it("honours an override the type supports", () => {
    expect(
      effectiveProgressDisplay({ type: "Light Novel", units: [], progress_display: "vol_tw" }),
    ).toBe("vol_tw");
  });

  it("ignores a volume override on a Web novel and derives instead", () => {
    // Pull and Fill write this column; a Web novel has no volume row to show.
    expect(
      effectiveProgressDisplay({ type: "Web", units: [], progress_display: "vol_tw" }),
    ).toBe("ch");
  });

  it("ignores a chapter override on a volume-only type", () => {
    expect(
      effectiveProgressDisplay({ type: "Light Novel", units: [], progress_display: "ch" }),
    ).toBe("vol_original");
  });

  it("ignores an arc override when the novel has no arc rows", () => {
    expect(
      effectiveProgressDisplay({ type: "Web", units: [], progress_display: "arc_ch" }),
    ).toBe("ch");
    expect(
      effectiveProgressDisplay({ type: "Web", units: [], progress_display: "arc" }),
    ).toBe("ch");
  });

  it("honours an arc override once arc rows exist", () => {
    const units = [{ unit_kind: "arc", position: 1, ch_count: 100 }];
    expect(
      effectiveProgressDisplay({ type: "Web", units, progress_display: "arc" }),
    ).toBe("arc");
  });

  it("ignores a value nothing recognises", () => {
    expect(
      effectiveProgressDisplay({ type: "Web", units: [], progress_display: "nonsense" }),
    ).toBe("ch");
  });
});

describe("wholeArcStep", () => {
  const arcs = [
    { unit_kind: "arc", position: 1, ch_count: 100 },
    { unit_kind: "arc", position: 2, ch_count: 112 },
    { unit_kind: "arc", position: 3, ch_count: 90 },
  ];

  it("finishes one more arc and resets the in-arc cursor", () => {
    expect(wholeArcStep(arcs, 1, 40, 1)).toEqual({ arc_fin: 2, ch_fin_in_arc: 0 });
  });

  it("steps back a whole arc", () => {
    expect(wholeArcStep(arcs, 2, 0, -1)).toEqual({ arc_fin: 1, ch_fin_in_arc: 0 });
  });

  it("clamps at zero", () => {
    expect(wholeArcStep(arcs, 0, 0, -1)).toEqual({ arc_fin: 0, ch_fin_in_arc: 0 });
  });

  it("clamps at the last arc", () => {
    expect(wholeArcStep(arcs, 3, 0, 1)).toEqual({ arc_fin: 3, ch_fin_in_arc: 0 });
  });
});
