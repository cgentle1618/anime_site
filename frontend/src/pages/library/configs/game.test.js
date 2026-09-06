// Frontend: the game library config's filters and sorts.
//
// The play axis is new, so these lock the three filters that make the page
// useful — play status, ownership and base-game-vs-DLC — and the playtime
// sort, which is the only numeric sort no other library has.
import { describe, expect, it } from "vitest";
import GAME_LIBRARY_CONFIG from "./game";

const GAMES = [
  {
    system_id: "1",
    game_name_cn: "艾爾登法環",
    game_name_en: "Elden Ring",
    game_type: "Base Game",
    playing_status: "Active Playing",
    ownership: "Owned",
    hours_played: 32.5,
  },
  {
    system_id: "2",
    game_name_en: "Shadow of the Erdtree",
    game_type: "DLC",
    playing_status: "Might Play",
    ownership: "Wishlist",
  },
];

describe("game library config", () => {
  it("filters by play-status display group", () => {
    const filter = GAME_LIBRARY_CONFIG.filterDefs.find(
      (f) => f.key === "playingStatus",
    );
    expect(filter.match(GAMES[0], new Set(["Playing"]))).toBe(true);
    expect(filter.match(GAMES[1], new Set(["Playing"]))).toBe(false);
  });

  it("filters by ownership", () => {
    const filter = GAME_LIBRARY_CONFIG.filterDefs.find((f) => f.key === "ownership");
    expect(filter.match(GAMES[0], new Set(["Owned"]))).toBe(true);
  });

  it("filters by game type so DLC can be separated from base games", () => {
    const filter = GAME_LIBRARY_CONFIG.filterDefs.find((f) => f.key === "gameType");
    expect(filter.match(GAMES[1], new Set(["DLC"]))).toBe(true);
  });

  it("sorts by playtime, longest first", () => {
    const sort = GAME_LIBRARY_CONFIG.sortDefs.find((s) => s.key === "hours_played");
    expect([...GAMES].sort(sort.compare)[0].system_id).toBe("1");
  });
});
