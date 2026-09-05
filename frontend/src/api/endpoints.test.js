// Contract tests for the endpoint builders. These lock the exact URL strings so
// migrating raw fetch() call sites to endpoints.* is provably URL-preserving.
import { describe, it, expect } from "vitest";
import { endpoints, resource } from "./endpoints";

describe("resource() endpoints (derived from MEDIA_CONFIG)", () => {
  const cases = {
    anime: "/api/anime",
    "anime-movie": "/api/anime-movie",
    movie: "/api/movies",
    "tv-show": "/api/tv-shows",
    cartoon: "/api/cartoon",
    manga: "/api/manga",
    novel: "/api/novel",
    comic: "/api/comic",
    franchise: "/api/franchise",
    series: "/api/series",
  };

  for (const [type, base] of Object.entries(cases)) {
    it(`${type} -> ${base}`, () => {
      const r = resource(type);
      expect(r.list()).toBe(`${base}/`);
      expect(r.detail("X")).toBe(`${base}/X`);
      expect(r.create()).toBe(`${base}/`);
      expect(r.update("X")).toBe(`${base}/X`);
      expect(r.patch("X")).toBe(`${base}/X`);
      expect(r.remove("X")).toBe(`${base}/X`);
      expect(r.complete("X")).toBe(`${base}/X/complete`);
    });
  }

  it("throws on unknown type", () => {
    expect(() => resource("nope")).toThrow();
  });
});

describe("named endpoint groups", () => {
  it("auth", () => {
    expect(endpoints.auth.login()).toBe("/api/auth/login");
    expect(endpoints.auth.logout()).toBe("/api/auth/logout");
    expect(endpoints.auth.me()).toBe("/api/auth/me");
  });

  it("options", () => {
    expect(endpoints.options.list()).toBe("/api/options/");
    expect(endpoints.options.byCategory("Studio")).toBe("/api/options/Studio");
    expect(endpoints.options.update(5)).toBe("/api/options/5");
    expect(endpoints.options.remove(5)).toBe("/api/options/5");
  });

  it("seasonal", () => {
    expect(endpoints.seasonal.list()).toBe("/api/seasonal/");
    expect(endpoints.seasonal.detail("WIN 2026")).toBe("/api/seasonal/WIN 2026");
    expect(endpoints.seasonal.currentSeason()).toBe("/api/seasonal/current-season");
    expect(endpoints.seasonal.update("WIN 2026")).toBe("/api/seasonal/WIN 2026");
  });

  it("system", () => {
    expect(endpoints.system.currentSeason()).toBe("/api/system/config/current_season");
    expect(endpoints.system.logs()).toBe("/api/system/logs");
    expect(endpoints.system.log(3)).toBe("/api/system/logs/3");
    expect(endpoints.system.deleted()).toBe("/api/system/deleted");
    expect(endpoints.system.deletedRecord(3)).toBe("/api/system/deleted/3");
    expect(endpoints.system.testBucket()).toBe("/api/system/test-bucket");
  });

  it("character", () => {
    expect(endpoints.character.list()).toBe("/api/character/");
    expect(endpoints.character.list("q=x")).toBe("/api/character/?q=x");
    expect(endpoints.character.detail(7)).toBe("/api/character/7");
    expect(endpoints.character.create()).toBe("/api/character/");
    expect(endpoints.character.update(7)).toBe("/api/character/7");
    expect(endpoints.character.remove(7, 2)).toBe("/api/character/7?castings=2");
    expect(endpoints.character.merge(7)).toBe("/api/character/7/merge");
    expect(endpoints.character.entries(7)).toBe("/api/character/7/entries");
  });

  it("casting", () => {
    expect(endpoints.casting.get("anime-movie", 3)).toBe(
      "/api/casting/anime-movie/3",
    );
    expect(endpoints.casting.replace("anime-movie", 3)).toBe(
      "/api/casting/anime-movie/3",
    );
  });

  it("dataControl", () => {
    expect(endpoints.dataControl.fill("anime")).toBe("/api/data-control/fill/anime");
    expect(endpoints.dataControl.fillAll()).toBe("/api/data-control/fill/all");
    expect(endpoints.dataControl.replace("manga")).toBe("/api/data-control/replace/manga");
    expect(endpoints.dataControl.replaceSingle("anime", "X")).toBe("/api/data-control/replace/anime/X");
    expect(endpoints.dataControl.replaceAll()).toBe("/api/data-control/replace/all");
    expect(endpoints.dataControl.pull("Anime")).toBe("/api/data-control/pull/Anime");
    expect(endpoints.dataControl.pullAll()).toBe("/api/data-control/pull");
    expect(endpoints.dataControl.backup()).toBe("/api/data-control/backup");
    expect(endpoints.dataControl.calculateAll()).toBe("/api/data-control/calculate/all");
    expect(endpoints.dataControl.checkDuplicates()).toBe("/api/data-control/check/duplicates");
    expect(endpoints.dataControl.checkRemarks()).toBe("/api/data-control/check/remarks");
  });
});
