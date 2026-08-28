// Frontend: unit tests for the pure media helpers.
/**
 * These used to live in src/utils/anime.js. That module was split across lib/
 * in 407a510 and the barrel src/utils/media.js now re-exports the pieces, so
 * the imports below name the specific modules the barrel points at rather than
 * the barrel itself. No network calls or DB required.
 */

import { describe, it, expect } from "vitest";
import { FALLBACK_SVG, getCoverUrl } from "../lib/covers";
import { getDisplayName, getSortName } from "../lib/naming";
import {
  getStatusButtonConfig,
  getStatusStyle,
  getNextStatus,
} from "../lib/status";
import { isBaha, getReleaseFallback, getRatingWeight } from "../lib/formatters";

// ---------------------------------------------------------------------------
// getCoverUrl
// ---------------------------------------------------------------------------

describe("getCoverUrl", () => {
  it("returns FALLBACK_SVG for null", () => {
    expect(getCoverUrl(null)).toBe(FALLBACK_SVG);
  });

  it("returns FALLBACK_SVG for undefined", () => {
    expect(getCoverUrl(undefined)).toBe(FALLBACK_SVG);
  });

  it("returns FALLBACK_SVG for 'N/A'", () => {
    expect(getCoverUrl("N/A")).toBe(FALLBACK_SVG);
  });

  it("returns local static path on localhost (jsdom default)", () => {
    // jsdom sets hostname to 'localhost' by default
    const url = getCoverUrl("abc123.jpg");
    expect(url).toBe("/static/covers/abc123.jpg");
  });
});

// ---------------------------------------------------------------------------
// getDisplayName
// ---------------------------------------------------------------------------

describe("getDisplayName", () => {
  it("returns CN name first for anime type", () => {
    const item = { anime_name_cn: "中文名", anime_name_en: "English" };
    expect(getDisplayName(item, "anime")).toBe("中文名");
  });

  it("falls back to EN when CN is absent", () => {
    const item = { anime_name_cn: null, anime_name_en: "English" };
    expect(getDisplayName(item, "anime")).toBe("English");
  });

  it("falls back to alt when CN and EN are absent", () => {
    const item = { anime_name_cn: null, anime_name_en: null, anime_name_alt: "Alt" };
    expect(getDisplayName(item, "anime")).toBe("Alt");
  });

  it("falls back to roman when CN/EN/alt are absent", () => {
    const item = {
      anime_name_cn: null,
      anime_name_en: null,
      anime_name_alt: null,
      anime_name_roman: "Romaji",
    };
    expect(getDisplayName(item, "anime")).toBe("Romaji");
  });

  it("falls back to JP when all others absent", () => {
    const item = {
      anime_name_cn: null,
      anime_name_en: null,
      anime_name_alt: null,
      anime_name_roman: null,
      anime_name_jp: "日本語",
    };
    expect(getDisplayName(item, "anime")).toBe("日本語");
  });

  it("returns 'Unknown Title' when all name fields are absent", () => {
    expect(getDisplayName({}, "anime")).toBe("Unknown Title");
  });

  it("returns empty string for null item", () => {
    expect(getDisplayName(null, "anime")).toBe("");
  });

  it("uses series_name_cn for series type", () => {
    const item = { series_name_cn: "系列", series_name_en: "Series" };
    expect(getDisplayName(item, "series")).toBe("系列");
  });

  it("falls back to series_name_en for series type", () => {
    const item = { series_name_cn: null, series_name_en: "Series EN" };
    expect(getDisplayName(item, "series")).toBe("Series EN");
  });

  it("works for franchise type", () => {
    const item = { franchise_name_cn: "系列", franchise_name_en: "Franchise" };
    expect(getDisplayName(item, "franchise")).toBe("系列");
  });
});

// ---------------------------------------------------------------------------
// getSortName
// ---------------------------------------------------------------------------

describe("getSortName", () => {
  it("returns EN name for anime type", () => {
    const item = { anime_name_en: "English", anime_name_cn: "中文" };
    expect(getSortName(item, "anime")).toBe("English");
  });

  it("prefers EN over CN for sort name", () => {
    const item = { anime_name_cn: "中文", anime_name_en: "English" };
    expect(getSortName(item, "anime")).toBe("English");
  });

  it("falls back to CN when EN and Roman are absent", () => {
    const item = { anime_name_cn: "中文", anime_name_en: null, anime_name_roman: null };
    expect(getSortName(item, "anime")).toBe("中文");
  });

  it("falls back to roman when EN is absent", () => {
    const item = { anime_name_en: null, anime_name_roman: "Romaji" };
    expect(getSortName(item, "anime")).toBe("Romaji");
  });

  it("returns empty string for null item", () => {
    expect(getSortName(null, "anime")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// isBaha
// ---------------------------------------------------------------------------

describe("isBaha", () => {
  it("returns true when source_baha is boolean true", () => {
    expect(isBaha({ source_baha: true })).toBe(true);
  });

  it("returns true when source_baha is string 'true'", () => {
    expect(isBaha({ source_baha: "true" })).toBe(true);
  });

  it("returns false when source_baha is false", () => {
    expect(isBaha({ source_baha: false })).toBe(false);
  });

  it("returns false when source_baha is null", () => {
    expect(isBaha({ source_baha: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getNextStatus
// ---------------------------------------------------------------------------

const STATUS_CYCLE = [
  "Might Watch",
  "Plan to Watch",
  "Watch When Airs",
  "Active Watching",
  "Passive Watching",
  "Paused",
  "Completed",
  "Temp Dropped",
  "Won't Watch",
  "Dropped",
];

describe("getNextStatus", () => {
  it("cycles to next status", () => {
    expect(getNextStatus("Might Watch")).toBe("Plan to Watch");
    expect(getNextStatus("Plan to Watch")).toBe("Watch When Airs");
  });

  it("wraps from last status back to first", () => {
    expect(getNextStatus("Dropped")).toBe("Might Watch");
  });

  it("returns Might Watch for unknown status", () => {
    expect(getNextStatus("Not A Real Status")).toBe("Might Watch");
  });

  it("covers all 10 statuses in cycle", () => {
    STATUS_CYCLE.forEach((status, i) => {
      const expected = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
      expect(getNextStatus(status)).toBe(expected);
    });
  });
});

// ---------------------------------------------------------------------------
// getStatusButtonConfig
// ---------------------------------------------------------------------------

describe("getStatusButtonConfig", () => {
  it("returns config object with symbol and cls for each status", () => {
    STATUS_CYCLE.forEach((status) => {
      const config = getStatusButtonConfig(status);
      expect(config).toHaveProperty("symbol");
      expect(config).toHaveProperty("cls");
    });
  });

  it("returns fallback config for unknown status", () => {
    const config = getStatusButtonConfig("Unknown");
    expect(config).toHaveProperty("symbol");
  });

  it("Completed status has checkmark symbol", () => {
    expect(getStatusButtonConfig("Completed").symbol).toBe("✓");
  });

  it("Might Watch status has plus symbol", () => {
    expect(getStatusButtonConfig("Might Watch").symbol).toBe("+");
  });
});

// ---------------------------------------------------------------------------
// getStatusStyle
// ---------------------------------------------------------------------------

describe("getStatusStyle", () => {
  it("returns style object with cls and icon for each status", () => {
    STATUS_CYCLE.forEach((status) => {
      const style = getStatusStyle(status);
      expect(style).toHaveProperty("cls");
      expect(style).toHaveProperty("icon");
    });
  });

  it("returns fallback for unknown status", () => {
    const style = getStatusStyle("Unknown");
    expect(style).toHaveProperty("cls");
  });
});

// ---------------------------------------------------------------------------
// getReleaseFallback
// ---------------------------------------------------------------------------

describe("getReleaseFallback", () => {
  it("returns season + year when both present", () => {
    expect(
      getReleaseFallback({ release_season: "WIN", release_date: "2024-01" })
    ).toBe("WIN 2024");
  });

  it("returns the stored date verbatim when the season is absent", () => {
    expect(
      getReleaseFallback({ release_season: null, release_date: "2024-01" })
    ).toBe("2024-01");
  });

  it("returns year only when that is all that is stored", () => {
    expect(getReleaseFallback({ release_date: "2024" })).toBe("2024");
  });

  it("returns TBA when all absent", () => {
    expect(getReleaseFallback({})).toBe("TBA");
  });
});

// ---------------------------------------------------------------------------
// getRatingWeight
// ---------------------------------------------------------------------------

describe("getRatingWeight", () => {
  it("S is lightest (0)", () => {
    expect(getRatingWeight("S")).toBe(0);
  });

  it("F is heaviest (7)", () => {
    expect(getRatingWeight("F")).toBe(7);
  });

  it("null/unknown returns 99 (sorts last)", () => {
    expect(getRatingWeight(null)).toBe(99);
    expect(getRatingWeight(undefined)).toBe(99);
    expect(getRatingWeight("Z")).toBe(99);
  });

  it("all grades have increasing weights S < A+ < A < B < C < D < E < F", () => {
    const grades = ["S", "A+", "A", "B", "C", "D", "E", "F"];
    const weights = grades.map(getRatingWeight);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]);
    }
  });
});

