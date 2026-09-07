import { describe, it, expect } from "vitest";

import {
  TIER1_GROUPS,
  TIER2_GROUPS,
  UNGROUPED_TITLE,
  groupTier1Keys,
  groupTier2Categories,
} from "./optionsPageGroups";

// The shape /api/constants actually serves, so a key added there without a
// group still lands somewhere visible.
const SERVED = [
  "airing_status",
  "anime_airing_type",
  "cartoon_airing_type",
  "character_role",
  "comic_type",
  "completion_level",
  "day_of_week",
  "franchise_expectation",
  "franchise_type",
  "game_acquisition",
  "game_copy_format",
  "game_ownership",
  "game_release_status",
  "game_storefront",
  "game_type",
  "is_main",
  "manga_region",
  "manga_serialization_status",
  "media_type",
  "movie_type",
  "music_status",
  "my_rating",
  "novel_region",
  "novel_serialization_status",
  "novel_type",
  "option_categories",
  "playing_status",
  "person_role",
  "reading_status",
  "seiyuu_status",
  "tag_categories",
  "tv_region",
  "watch_order_importance",
  "watching_status",
];

describe("groupTier1Keys", () => {
  it("reads every 'what kind of work is this' list as one Entry Type group", () => {
    const entry = groupTier1Keys(SERVED).find((s) => s.title === "Entry Type");
    expect(entry.keys).toEqual([
      "anime_airing_type",
      "cartoon_airing_type",
      "movie_type",
      "novel_type",
      "comic_type",
      "game_type",
    ]);
  });

  it("files the game lists other media types share by what they answer", () => {
    const sections = groupTier1Keys(SERVED);
    const at = (title) => sections.find((s) => s.title === title).keys;
    expect(at("Publication Status")).toContain("game_release_status");
    expect(at("My Progress")).toContain("playing_status");
    expect(at("Game")).toEqual([
      "completion_level",
      "game_storefront",
      "game_ownership",
      "game_copy_format",
      "game_acquisition",
    ]);
  });

  it("heads the game lists rather than dropping them into Other", () => {
    const other = groupTier1Keys(SERVED).find((s) => s.title === UNGROUPED_TITLE);
    expect(other.keys.filter((k) => k.startsWith("game_"))).toEqual([]);
  });

  it("keeps the groups in their declared order, Other last", () => {
    const titles = groupTier1Keys(SERVED).map((s) => s.title);
    expect(titles).toEqual([...TIER1_GROUPS.map((g) => g.title), UNGROUPED_TITLE]);
  });

  it("leaves the ungrouped keys under Other, alphabetically", () => {
    const other = groupTier1Keys(SERVED).find((s) => s.title === UNGROUPED_TITLE);
    expect(other.keys).toEqual([
      "character_role",
      "day_of_week",
      "is_main",
      "my_rating",
      "watch_order_importance",
    ]);
  });

  it("shows every served key exactly once", () => {
    const flat = groupTier1Keys(SERVED).flatMap((s) => s.keys);
    expect([...flat].sort()).toEqual([...SERVED].sort());
  });

  it("never invents a key the endpoint did not serve", () => {
    const sections = groupTier1Keys(["anime_airing_type", "my_rating"]);
    expect(sections.flatMap((s) => s.keys)).toEqual([
      "anime_airing_type",
      "my_rating",
    ]);
  });

  it("demotes a group left with a single member instead of heading it", () => {
    const sections = groupTier1Keys(["tv_region", "my_rating"]);
    expect(sections).toEqual([
      { title: UNGROUPED_TITLE, keys: ["my_rating", "tv_region"] },
    ]);
  });

  it("claims each key for one group only", () => {
    const seen = new Set();
    for (const group of TIER1_GROUPS) {
      for (const key of group.keys) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("returns nothing when the endpoint served nothing", () => {
    expect(groupTier1Keys([])).toEqual([]);
  });
});

// The categories OPTION_CATEGORIES actually yields today, in the order
// /api/options serves them (by category name).
const CATEGORIES = [
  "Combat Mode",
  "Comic Continuity",
  "Comic Era",
  "Comic Event",
  "Comic Imprint",
  "Franchise for Filter",
  "Game Genre",
  "Game Mode",
  "Game Platform",
  "Game Theme",
  "Genre Main",
  "Genre Sub",
  "Label",
  "Platform",
  "Quality",
  "Reference Source",
  "Serialization Platform",
];

describe("groupTier2Categories", () => {
  it("keeps the groups in their declared order, Other last", () => {
    const titles = groupTier2Categories(CATEGORIES).map((s) => s.title);
    expect(titles).toEqual([
      ...TIER2_GROUPS.map((g) => g.title),
      UNGROUPED_TITLE,
    ]);
  });

  it("reads the four anime tag vocabularies together", () => {
    const tags = groupTier2Categories(CATEGORIES).find(
      (s) => s.title === "Tags",
    );
    expect(tags.categories).toEqual([
      "Genre Main",
      "Genre Sub",
      "Label",
      "Quality",
    ]);
  });

  it("reads the source and platform vocabularies together", () => {
    const sources = groupTier2Categories(CATEGORIES).find(
      (s) => s.title === "Source & Platform",
    );
    expect(sources.categories).toEqual([
      "Platform",
      "Serialization Platform",
      "Reference Source",
    ]);
  });

  // "Publisher / Distributor TW" (Source & Platform) and "Comic Publisher"
  // (Comic) were grouped here until 2026-09-07. Neither is a vocabulary any
  // more - a publisher is an entity, edited on the Publisher tab - so both
  // would now fall through to Other, which is exactly where an unknown
  // category belongs.
  it("parks the retired publisher vocabularies under Other", () => {
    const sections = groupTier2Categories([
      ...CATEGORIES,
      "Comic Publisher",
      "Publisher / Distributor TW",
    ]);
    const other = sections.find((s) => s.title === UNGROUPED_TITLE);
    expect(other.categories).toContain("Comic Publisher");
    expect(other.categories).toContain("Publisher / Distributor TW");
  });

  it("shows every served category exactly once", () => {
    const flat = groupTier2Categories(CATEGORIES).flatMap((s) => s.categories);
    expect([...flat].sort()).toEqual([...CATEGORIES].sort());
  });

  it("drops a category the database has no rows for", () => {
    const sections = groupTier2Categories(["Genre Main", "Genre Sub"]);
    expect(sections).toEqual([
      { title: "Tags", categories: ["Genre Main", "Genre Sub"] },
    ]);
  });

  it("parks a category no group claims under Other", () => {
    const other = groupTier2Categories([
      ...CATEGORIES,
      "Board Game Mechanic",
    ]).find((s) => s.title === UNGROUPED_TITLE);
    expect(other.categories).toEqual([
      "Board Game Mechanic",
      "Franchise for Filter",
    ]);
  });

  it("demotes a group left with a single member instead of heading it", () => {
    const sections = groupTier2Categories(["Comic Era", "Franchise for Filter"]);
    expect(sections).toEqual([
      {
        title: UNGROUPED_TITLE,
        categories: ["Comic Era", "Franchise for Filter"],
      },
    ]);
  });

  it("claims each category for one group only", () => {
    const seen = new Set();
    for (const group of TIER2_GROUPS) {
      for (const category of group.categories) {
        expect(seen.has(category)).toBe(false);
        seen.add(category);
      }
    }
  });

  it("returns nothing when the database served nothing", () => {
    expect(groupTier2Categories([])).toEqual([]);
  });
});
