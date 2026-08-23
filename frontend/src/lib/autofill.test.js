// Guards the refactor that replaced six hardcoded applyXAutofill functions in
// Add.jsx with one registry-driven helper. The expected objects below are the
// literal output of those old functions, transcribed from the code they
// replaced — if buildAutofillPatch ever stops matching them, auto-fill has
// silently changed behavior.

import { describe, expect, it } from "vitest";
import { buildAutofillPatch } from "./autofill";
import { BUILTIN_AUTOFILL } from "../config/formFields";

const FRANCHISES = [
  { system_id: "f1", franchise_name_cn: "測試系列", franchise_name_en: "Test" },
];
const SERIES = [
  { system_id: "s1", series_name_cn: "測試子系列", series_name_en: "Sub" },
];
const ctx = { allFranchises: FRANCHISES, allSeries: SERIES };

/** Runs the helper with a type's built-in (unconfigured) field list. */
function patchFor(source, type, extraCtx = {}) {
  return buildAutofillPatch(source, type, BUILTIN_AUTOFILL[type], {
    ...ctx,
    ...extraCtx,
  });
}

describe("buildAutofillPatch — parity with the old per-type functions", () => {
  it("copies the anime field set", () => {
    const source = {
      anime_name_en: "Frieren",
      anime_name_cn: "葬送的芙莉蓮",
      anime_name_roman: "Sousou no Frieren",
      anime_name_jp: "葬送のフリーレン",
      anime_name_alt: "",
      franchise_id: "f1",
      series_id: "s1",
      airing_type: "TV",
      is_main: "本傳",
      genre_main: "Adventure",
      genre_sub: "Drama, Fantasy",
      studio: "Madhouse",
      // Not in the anime autofill set — must not leak into the patch.
      ep_total: 28,
      my_rating: "S",
    };

    expect(patchFor(source, "anime")).toEqual({
      anime_name_en: "Frieren",
      anime_name_cn: "葬送的芙莉蓮",
      anime_name_roman: "Sousou no Frieren",
      anime_name_jp: "葬送のフリーレン",
      anime_name_alt: "",
      franchise_id: "f1",
      franchise_text: "測試系列",
      series_id: "s1",
      series_text: "測試子系列",
      airing_type: "TV",
      is_main: "本傳",
      genre_main: "Adventure",
      genre_sub: "Drama, Fantasy",
      studio: "Madhouse",
    });
  });

  it("copies the cartoon field set", () => {
    const source = {
      cartoon_name_en: "Gravity Falls",
      cartoon_name_cn: "怪誕小鎮",
      cartoon_name_alt: "",
      franchise_id: "f1",
      series_id: null,
      airing_type: "TV",
      is_main: "本傳",
      source_official: "Disney+",
      season_part: "Season 1",
      imdb_link: "https://www.imdb.com/title/tt1865718/",
    };

    expect(patchFor(source, "cartoon")).toEqual({
      cartoon_name_en: "Gravity Falls",
      cartoon_name_cn: "怪誕小鎮",
      cartoon_name_alt: "",
      franchise_id: "f1",
      franchise_text: "測試系列",
      series_id: null,
      series_text: "",
      airing_type: "TV",
      is_main: "本傳",
      source_official: "Disney+",
      season_part: "Season 1",
      imdb_link: "https://www.imdb.com/title/tt1865718/",
    });
  });

  it("copies the manga field set", () => {
    const source = {
      manga_name_cn: "海賊王",
      manga_name_en: "One Piece",
      manga_name_roman: "",
      manga_name_jp: "ワンピース",
      manga_name_alt: "",
      franchise_id: "f1",
      series_id: "s1",
      region: "日漫",
      is_main: "本傳",
    };

    expect(patchFor(source, "manga")).toEqual({
      manga_name_cn: "海賊王",
      manga_name_en: "One Piece",
      manga_name_roman: "",
      manga_name_jp: "ワンピース",
      manga_name_alt: "",
      franchise_id: "f1",
      franchise_text: "測試系列",
      series_id: "s1",
      series_text: "測試子系列",
      region: "日漫",
      is_main: "本傳",
    });
  });

  it("copies the novel field set, including type", () => {
    const source = {
      novel_name_cn: "重生",
      novel_name_en: "Rebirth",
      novel_name_roman: "",
      novel_name_jp: "",
      novel_name_alt: "",
      franchise_id: null,
      series_id: null,
      region: "JP",
      type: "Light Novel",
      is_main: "本傳",
    };

    expect(patchFor(source, "novel")).toEqual({
      novel_name_cn: "重生",
      novel_name_en: "Rebirth",
      novel_name_roman: "",
      novel_name_jp: "",
      novel_name_alt: "",
      franchise_id: null,
      franchise_text: "",
      series_id: null,
      series_text: "",
      region: "JP",
      type: "Light Novel",
      is_main: "本傳",
    });
  });

  it("copies the tv-show field set", () => {
    const source = {
      tv_name_en: "Severance",
      tv_name_cn: "人生切割術",
      tv_name_alt: "",
      franchise_id: "f1",
      series_id: "s1",
      season_part: "Season 2",
      is_main: "本傳",
      region: "歐美劇",
      imdb_link: "https://www.imdb.com/title/tt11280740/",
    };

    expect(patchFor(source, "tv-show")).toEqual({
      tv_name_en: "Severance",
      tv_name_cn: "人生切割術",
      tv_name_alt: "",
      franchise_id: "f1",
      franchise_text: "測試系列",
      series_id: "s1",
      series_text: "測試子系列",
      season_part: "Season 2",
      is_main: "本傳",
      region: "歐美劇",
      imdb_link: "https://www.imdb.com/title/tt11280740/",
    });
  });

  it("copies the movie field set", () => {
    const source = {
      movie_name_en: "Dune",
      movie_name_cn: "沙丘",
      movie_name_alt: "",
      franchise_id: "f1",
      series_id: null,
      is_main: "本傳",
      airing_status: "Finished Airing",
      movie_type: "Reality",
    };

    expect(patchFor(source, "movie")).toEqual({
      movie_name_en: "Dune",
      movie_name_cn: "沙丘",
      movie_name_alt: "",
      franchise_id: "f1",
      franchise_text: "測試系列",
      series_id: null,
      series_text: "",
      is_main: "本傳",
      airing_status: "Finished Airing",
      movie_type: "Reality",
    });
  });
});

describe("buildAutofillPatch — configured behavior", () => {
  it("falls back to the configured default for movie airing_status", () => {
    // The old code pinned a literal "Not Yet Aired" here, contradicting the
    // Movie tab's own "Finished Airing" default. It now follows the default.
    const patch = buildAutofillPatch(
      { airing_status: null },
      "movie",
      ["airing_status"],
      { ...ctx, defaults: { airing_status: "Finished Airing" } },
    );
    expect(patch.airing_status).toBe("Finished Airing");
  });

  it("blanks other empty fields rather than falling back", () => {
    const patch = buildAutofillPatch({ is_main: null }, "movie", ["is_main"], {
      ...ctx,
      defaults: { is_main: "本傳" },
    });
    expect(patch.is_main).toBe("");
  });

  it("copies only the configured fields", () => {
    const source = { anime_name_en: "A", studio: "B", genre_main: "C" };
    expect(buildAutofillPatch(source, "anime", ["studio"], ctx)).toEqual({
      studio: "B",
    });
  });

  it("returns an empty patch when nothing is configured", () => {
    expect(buildAutofillPatch({ anime_name_en: "A" }, "anime", [], ctx)).toEqual(
      {},
    );
  });

  it("ignores keys that no longer exist on the form", () => {
    const patch = buildAutofillPatch({ gone: "x", studio: "B" }, "anime", [
      "gone",
      "studio",
    ]);
    expect(patch).toEqual({ studio: "B" });
  });

  it("coerces boolean flags", () => {
    expect(
      buildAutofillPatch({ watch_next: 1 }, "movie", ["watch_next"], ctx),
    ).toEqual({ watch_next: true });
  });
});

describe("buildAutofillPatch — collection lookup", () => {
  const COLLECTIONS = [
    {
      system_id: "c1",
      collection_name_cn: "漫威",
      collection_name_en: "Marvel",
    },
  ];

  it("resolves the collection id and its display text together", () => {
    const patch = buildAutofillPatch(
      { collection_id: "c1" },
      "franchise",
      ["collection_id"],
      { ...ctx, allCollections: COLLECTIONS },
    );
    expect(patch).toEqual({ collection_id: "c1", collection_text: "漫威" });
  });

  it("blanks the text when the collection is unknown", () => {
    const patch = buildAutofillPatch(
      { collection_id: "missing" },
      "franchise",
      ["collection_id"],
      { ...ctx, allCollections: COLLECTIONS },
    );
    expect(patch).toEqual({
      collection_id: "missing",
      collection_text: "",
    });
  });

  it("nulls an absent collection rather than leaving it undefined", () => {
    const patch = buildAutofillPatch({}, "franchise", ["collection_id"], {
      ...ctx,
      allCollections: COLLECTIONS,
    });
    expect(patch).toEqual({ collection_id: null, collection_text: "" });
  });
});
