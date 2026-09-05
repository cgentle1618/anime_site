import { describe, it, expect } from "vitest";

import { TIER1_GROUPS, UNGROUPED_TITLE, groupTier1Keys } from "./enumGroups";

// The shape /api/constants actually serves, so a key added there without a
// group still lands somewhere visible.
const SERVED = [
  "airing_status",
  "anime_airing_type",
  "cartoon_airing_type",
  "character_role",
  "comic_type",
  "day_of_week",
  "franchise_expectation",
  "franchise_type",
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
  "person_role",
  "reading_status",
  "seiyuu_status",
  "tag_categories",
  "tv_region",
  "watch_order_importance",
  "watching_status",
];

describe("groupTier1Keys", () => {
  it("puts the two airing types together, anime first", () => {
    const airing = groupTier1Keys(SERVED).find((s) => s.title === "Airing Type");
    expect(airing.keys).toEqual(["anime_airing_type", "cartoon_airing_type"]);
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
