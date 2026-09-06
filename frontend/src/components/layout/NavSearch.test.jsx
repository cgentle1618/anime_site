// The label the universal search dropdown puts on a result row.
//
// The dropdown once carried its own per-type fallback chain, and `game` was
// never added to it, so every game result rendered as a dash. These tests pin
// the row label to the app-wide chain in lib/naming.js.
import { describe, expect, it } from "vitest";

import { getResultName } from "./NavSearch";

describe("getResultName", () => {
  it("names a game", () => {
    expect(
      getResultName({
        type: "game",
        game_name_cn: "艾爾登法環",
        game_name_en: "Elden Ring",
      }),
    ).toBe("艾爾登法環");
  });

  it("falls back down the chain when a game has no Chinese title", () => {
    expect(
      getResultName({ type: "game", game_name_cn: null, game_name_en: "Elden Ring" }),
    ).toBe("Elden Ring");
  });

  it("leads with the English title for a comic", () => {
    expect(
      getResultName({
        type: "comic",
        comic_name_cn: "蝙蝠俠",
        comic_name_en: "Batman",
      }),
    ).toBe("Batman");
  });

  it("uses the resolved display_name for a person", () => {
    expect(
      getResultName({ type: "person", display_name: "Hayao Miyazaki" }),
    ).toBe("Hayao Miyazaki");
  });

  it("names a seasonal by its one string", () => {
    expect(getResultName({ type: "seasonal", seasonal: "2026 Spring" })).toBe(
      "2026 Spring",
    );
  });

  it("shows a dash, not a placeholder sentence, when nothing is named", () => {
    expect(getResultName({ type: "game" })).toBe("—");
    expect(getResultName({ type: "series" })).toBe("—");
    expect(getResultName({ type: "person" })).toBe("—");
  });
});
