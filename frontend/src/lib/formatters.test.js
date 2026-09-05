import { describe, it, expect } from "vitest";
import { getReleaseFallback, getSourceValues, getNovelProgress } from "./formatters";

describe("getReleaseFallback", () => {
  it("prefers the season and year when both are known", () => {
    expect(
      getReleaseFallback({ release_season: "WIN", release_date: "2024-01" }),
    ).toBe("WIN 2024");
  });

  it("falls back to the stored date when there is no season", () => {
    expect(getReleaseFallback({ release_date: "2024-05-17" })).toBe(
      "2024-05-17",
    );
  });

  it("shows a year-only date as the year", () => {
    expect(getReleaseFallback({ release_date: "2024" })).toBe("2024");
  });

  it("shows TBA when nothing is stored", () => {
    expect(getReleaseFallback({})).toBe("TBA");
  });
});

// getSourceValues replaced getOptions(allOptions, category) when field
// suggestions were split into three source kinds (option / person / studio)
// — see fieldMeta.js's `source` descriptors and lib/sources.js.
describe("getSourceValues", () => {
  const sources = {
    options: [
      { category: "Genre Main", value: "Action", scopes: [], usages: [] },
      { category: "Genre Main", value: "Comedy", scopes: [], usages: [] },
      {
        category: "Publisher / Distributor TW",
        value: "Anime Only Publisher",
        scopes: ["anime"],
        usages: [],
      },
      {
        category: "Publisher / Distributor TW",
        value: "Manga Only Publisher",
        scopes: ["manga"],
        usages: [],
      },
      {
        category: "Publisher / Distributor TW",
        value: "Any Scope Publisher",
        scopes: [],
        usages: [],
      },
      {
        category: "Comic Era",
        value: "Modern Age",
        scopes: ["comic"],
        usages: [],
      },
    ],
    studios: [
      { display_name: "A-1 Pictures" },
      { display_name: "8bit" },
      { display_name: "" },
    ],
    people: {
      "director|anime": [{ display_name: "Abel Gongora" }],
      "director|non_anime": [{ display_name: "Alan Taylor" }],
      "composer|": [{ display_name: "Some Composer" }],
    },
  };

  it("returns nothing for a missing source or sources bag", () => {
    expect(getSourceValues(sources, null)).toEqual([]);
    expect(getSourceValues(null, { kind: "option", category: "Genre Main" })).toEqual(
      [],
    );
  });

  describe("kind: option", () => {
    it("filters by category", () => {
      expect(
        getSourceValues(sources, { kind: "option", category: "Genre Main" }),
      ).toEqual(["Action", "Comedy"]);
    });

    it("excludes values scoped to a different scope than requested", () => {
      const values = getSourceValues(sources, {
        kind: "option",
        category: "Publisher / Distributor TW",
        scope: "manga",
      });
      expect(values).not.toContain("Anime Only Publisher");
      expect(values).toContain("Manga Only Publisher");
    });

    it("returns an option with NO scopes for every requested scope", () => {
      // The entire point of the scope mechanism: an unscoped value is
      // universal, not merely "matches when no scope was asked for".
      const forManga = getSourceValues(sources, {
        kind: "option",
        category: "Publisher / Distributor TW",
        scope: "manga",
      });
      const forAnime = getSourceValues(sources, {
        kind: "option",
        category: "Publisher / Distributor TW",
        scope: "anime",
      });
      expect(forManga).toContain("Any Scope Publisher");
      expect(forAnime).toContain("Any Scope Publisher");
    });

    it("ignores scope filtering when the field itself is unscoped", () => {
      expect(
        getSourceValues(sources, { kind: "option", category: "Comic Era" }),
      ).toEqual(["Modern Age"]);
    });
  });

  describe("kind: person", () => {
    it("looks up sources.people by role|scope and excludes other scopes", () => {
      const anime = getSourceValues(sources, {
        kind: "person",
        role: "director",
        scope: "anime",
      });
      const nonAnime = getSourceValues(sources, {
        kind: "person",
        role: "director",
        scope: "non_anime",
      });
      expect(anime).toEqual(["Abel Gongora"]);
      expect(nonAnime).toEqual(["Alan Taylor"]);
    });

    it("treats a missing scope as the empty-string key", () => {
      expect(
        getSourceValues(sources, { kind: "person", role: "composer" }),
      ).toEqual(["Some Composer"]);
    });

    it("returns an empty list for a role/scope pair with no fetched people", () => {
      expect(
        getSourceValues(sources, {
          kind: "person",
          role: "producer",
          scope: "anime",
        }),
      ).toEqual([]);
    });
  });

  describe("kind: studio", () => {
    it("returns every studio's server-computed display_name", () => {
      expect(getSourceValues(sources, { kind: "studio" })).toEqual([
        "A-1 Pictures",
        "8bit",
      ]);
    });

    it("drops a studio with no display name instead of colliding with a typed value", () => {
      expect(
        getSourceValues(sources, { kind: "studio" }),
      ).not.toContain("");
    });
  });
});

describe("getSourceValues — usage", () => {
  const sources = {
    options: [
      { category: "Platform", value: "Netflix", scopes: [], usages: [] },
      { category: "Platform", value: "Fox", scopes: [], usages: ["origin"] },
      { category: "Platform", value: "Bahamut", scopes: ["anime"], usages: [] },
      { category: "Platform", value: "Crunchyroll", scopes: ["manga"] },
    ],
  };

  it("offers a value with no usages key at all for every usage", () => {
    // An older cached options response may not carry `usages`; absent must
    // behave the same as empty, i.e. "matches everything" - not "matches
    // nothing".
    for (const usage of ["watch", "origin"]) {
      const values = getSourceValues(sources, {
        kind: "option",
        category: "Platform",
        usage,
      });
      expect(values).toContain("Crunchyroll");
    }
  });

  it("hides an origin-only value from a watch picker", () => {
    const values = getSourceValues(sources, {
      kind: "option",
      category: "Platform",
      usage: "watch",
    });
    expect(values).toContain("Netflix");
    expect(values).not.toContain("Fox");
  });

  it("offers a value with no usages for every usage", () => {
    for (const usage of ["watch", "origin"]) {
      const values = getSourceValues(sources, {
        kind: "option",
        category: "Platform",
        usage,
      });
      expect(values).toContain("Netflix");
    }
  });

  it("applies scope and usage together", () => {
    const values = getSourceValues(sources, {
      kind: "option",
      category: "Platform",
      scope: "movie",
      usage: "watch",
    });
    expect(values).toEqual(["Netflix"]);
  });

  it("ignores usage when none is asked for", () => {
    const values = getSourceValues(sources, {
      kind: "option",
      category: "Platform",
    });
    expect(values).toContain("Fox");
  });
});

describe("getNovelProgress", () => {
  it("renders the two-stage arc position", () => {
    const novel = {
      progress_display: "arc_ch",
      arc_fin: 1,
      arc_total: 2,
      ch_fin_in_arc: 101,
      units: [
        { unit_kind: "arc", position: 1, ch_count: 100 },
        { unit_kind: "arc", position: 2, ch_count: 112 },
      ],
    };
    expect(getNovelProgress(novel)).toBe("arc 2 · 101/112 CH");
  });

  it("falls back to the flat chapter pair when there are no arcs", () => {
    const novel = { progress_display: "ch", ch_fin: 120, ch_total: 300, units: [] };
    expect(getNovelProgress(novel)).toBe("120 / 300 CH");
  });

  it("shows the JP/KR volume label", () => {
    const novel = { progress_display: "vol_original", vol_fin: 3, vol_total_original: 12 };
    expect(getNovelProgress(novel)).toBe("3 / 12 VOL JP/KR");
  });

  it("still shows TW volumes", () => {
    const novel = { progress_display: "vol_tw", vol_fin: 3, vol_total_tw: 9 };
    expect(getNovelProgress(novel)).toBe("3 / 9 VOL TW");
  });

  it("renders the arc-only display as finished arcs over the arc count", () => {
    const novel = {
      type: "Web",
      progress_display: "arc",
      arc_fin: 1,
      ch_fin_in_arc: 40,
      units: [
        { unit_kind: "arc", position: 1, ch_count: 100 },
        { unit_kind: "arc", position: 2, ch_count: 112 },
        { unit_kind: "arc", position: 3, ch_count: 90 },
      ],
    };
    expect(getNovelProgress(novel)).toBe("1 / 3 ARC");
  });

  it("ignores an arc display on a novel with no arc rows", () => {
    const novel = { type: "Web", progress_display: "arc", ch_fin: 12, ch_total: 40, units: [] };
    expect(getNovelProgress(novel)).toBe("12 / 40 CH");
  });

  it("ignores a volume display on a Web novel", () => {
    const novel = { type: "Web", progress_display: "vol_tw", vol_fin: 3, ch_fin: 12, ch_total: 40, units: [] };
    expect(getNovelProgress(novel)).toBe("12 / 40 CH");
  });

  it("a new Web novel with arc rows and no stored progress_display still renders the two-stage position (Decision G)", () => {
    const novel = {
      type: "Web",
      progress_display: "",
      arc_fin: 1,
      arc_total: 2,
      ch_fin_in_arc: 101,
      units: [
        { unit_kind: "arc", position: 1, ch_count: 100 },
        { unit_kind: "arc", position: 2, ch_count: 112 },
      ],
    };
    expect(getNovelProgress(novel)).toBe("arc 2 · 101/112 CH");
  });
});
