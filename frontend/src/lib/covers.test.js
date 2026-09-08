// Frontend: unit tests for cover URL resolution.
/**
 * Cover files are stored under owner-typed subfolders
 * (`static/covers/<media_type>/<system_id>.jpg`), and the DB columns hold the
 * full key. These tests pin the two consequences: a stored key is passed
 * through untouched, and the "convention filename" fallback must know the
 * media type or give up.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_SVG,
  getCollectionCover,
  getCoverUrl,
  getFranchiseCover,
  getSeriesCover,
} from "./covers";

/** Pretend the page is served from production rather than the dev server. */
function useRemoteHost() {
  vi.stubGlobal("location", { hostname: "cg1618.app" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCoverUrl", () => {
  it("passes a full owner-typed key through unchanged on localhost", () => {
    expect(getCoverUrl("anime/abc123.jpg")).toBe(
      "/static/covers/anime/abc123.jpg",
    );
  });

  it("builds the same /static/covers URL off localhost as on it", () => {
    useRemoteHost();
    expect(getCoverUrl("anime-movie/abc123.jpg")).toBe(
      "/static/covers/anime-movie/abc123.jpg",
    );
  });

  it("returns the placeholder for a missing or N/A file", () => {
    expect(getCoverUrl("")).toBe(FALLBACK_SVG);
    expect(getCoverUrl("N/A")).toBe(FALLBACK_SVG);
  });
});

describe("getFranchiseCover", () => {
  const franchise = { system_id: "f1" };

  it("uses the chosen entry's stored key", () => {
    const entry = {
      system_id: "e1",
      media_type: "anime",
      cover_image_file: "anime/e1.jpg",
    };
    expect(
      getFranchiseCover(
        { ...franchise, cover_entry_id: "e1" },
        { e1: entry },
        { f1: [entry] },
      ),
    ).toBe("/static/covers/anime/e1.jpg");
  });

  it("builds <media_type>/<id>.jpg for a chosen entry with no stored key", () => {
    const entry = { system_id: "e1", media_type: "manga" };
    expect(
      getFranchiseCover(
        { ...franchise, cover_entry_id: "e1" },
        { e1: entry },
        { f1: [entry] },
      ),
    ).toBe("/static/covers/manga/e1.jpg");
  });

  it("returns the placeholder when the chosen entry has no media_type", () => {
    const entry = { system_id: "e1" };
    expect(
      getFranchiseCover(
        { ...franchise, cover_entry_id: "e1" },
        { e1: entry },
        { f1: [entry] },
      ),
    ).toBe(FALLBACK_SVG);
  });

  it("prefers the newest member entry that has a stored key", () => {
    const old = {
      system_id: "e1",
      media_type: "anime",
      release_date: "2001-01-01",
      cover_image_file: "anime/e1.jpg",
    };
    const recent = {
      system_id: "e2",
      media_type: "movie",
      release_date: "2020-01-01",
      cover_image_file: "movie/e2.jpg",
    };
    expect(getFranchiseCover(franchise, {}, { f1: [old, recent] })).toBe(
      "/static/covers/movie/e2.jpg",
    );
  });

  it("falls back to the newest member entry by convention filename", () => {
    const old = {
      system_id: "e1",
      media_type: "anime",
      release_date: "2001-01-01",
    };
    const recent = {
      system_id: "e2",
      media_type: "novel",
      release_date: "2020-01-01",
    };
    expect(getFranchiseCover(franchise, {}, { f1: [old, recent] })).toBe(
      "/static/covers/novel/e2.jpg",
    );
  });

  it("returns the placeholder when the newest member entry has no media_type", () => {
    const entry = { system_id: "e1" };
    expect(getFranchiseCover(franchise, {}, { f1: [entry] })).toBe(
      FALLBACK_SVG,
    );
  });

  it("returns the placeholder for a franchise with no entries", () => {
    expect(getFranchiseCover(franchise, {}, {})).toBe(FALLBACK_SVG);
  });
});

describe("getSeriesCover", () => {
  it("uses the chosen entry's stored key", () => {
    const entries = [
      {
        system_id: "e1",
        media_type: "anime",
        cover_image_file: "anime/e1.jpg",
      },
    ];
    expect(getSeriesCover({ cover_entry_id: "e1" }, entries)).toBe(
      "/static/covers/anime/e1.jpg",
    );
  });

  it("falls back to the newest entry with a stored key", () => {
    const entries = [
      {
        system_id: "e1",
        release_date: "2001-01-01",
        cover_image_file: "anime/e1.jpg",
      },
      {
        system_id: "e2",
        release_date: "2020-01-01",
        cover_image_file: "comic/e2.jpg",
      },
    ];
    expect(getSeriesCover({}, entries)).toBe("/static/covers/comic/e2.jpg");
  });

  it("returns the placeholder when no entry has a cover", () => {
    expect(getSeriesCover({}, [{ system_id: "e1" }])).toBe(FALLBACK_SVG);
  });
});

describe("getCollectionCover", () => {
  const entry = {
    system_id: "e1",
    media_type: "anime",
    cover_image_file: "anime/e1.jpg",
  };
  const franchises = [{ system_id: "f1" }, { system_id: "f2" }];

  it("borrows the cover of the chosen member franchise", () => {
    expect(
      getCollectionCover(
        { cover_franchise_id: "f2" },
        franchises,
        {},
        {
          f2: [entry],
        },
      ),
    ).toBe("/static/covers/anime/e1.jpg");
  });

  it("falls through to the first member franchise that yields a cover", () => {
    expect(getCollectionCover({}, franchises, {}, { f2: [entry] })).toBe(
      "/static/covers/anime/e1.jpg",
    );
  });

  it("returns the placeholder when no member franchise has a cover", () => {
    expect(getCollectionCover({}, franchises, {}, {})).toBe(FALLBACK_SVG);
  });
});
