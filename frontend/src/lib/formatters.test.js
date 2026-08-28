import { describe, it, expect } from "vitest";
import { getReleaseFallback } from "./formatters";

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
