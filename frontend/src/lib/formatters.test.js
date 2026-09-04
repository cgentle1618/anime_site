import { describe, it, expect } from "vitest";
import { getReleaseFallback, getSourceValues } from "./formatters";

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
      { category: "Genre Main", value: "Action", scopes: [] },
      { category: "Genre Main", value: "Comedy", scopes: [] },
      {
        category: "Publisher / Distributor TW",
        value: "Anime Only Publisher",
        scopes: ["anime"],
      },
      {
        category: "Publisher / Distributor TW",
        value: "Manga Only Publisher",
        scopes: ["manga"],
      },
      {
        category: "Publisher / Distributor TW",
        value: "Any Scope Publisher",
        scopes: [],
      },
      { category: "Comic Era", value: "Modern Age", scopes: ["comic"] },
    ],
    studios: [
      { display_name: "A-1 Pictures" },
      { display_name: "8bit" },
      { display_name: "" },
    ],
    people: {
      "director|anime": [{ name_native: "Abel Gongora" }],
      "director|non_anime": [{ name_native: "Alan Taylor" }],
      "composer|": [{ name_native: "Some Composer" }],
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
