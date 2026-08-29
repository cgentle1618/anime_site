import { describe, it, expect } from "vitest";
import { effectiveBucket, entryBucket, groupByBucket } from "./planNext";

describe("effectiveBucket", () => {
  it("prefers the manual key", () => {
    expect(effectiveBucket({ anime: "24ep" }, { anime: "12ep" }, "anime")).toBe("12ep");
  });

  it("falls back to derived for keys with no override", () => {
    const derived = { anime: "24ep", "tv-show": "2season" };
    expect(effectiveBucket(derived, { anime: "12ep" }, "tv-show")).toBe("2season");
  });

  it("returns null when neither map has the key", () => {
    expect(effectiveBucket({ anime: "24ep" }, null, "movie")).toBeNull();
    expect(effectiveBucket(null, null, "anime")).toBeNull();
  });
});

describe("entryBucket", () => {
  const series = { size_group_derived: { anime: "24ep" }, size_group_manual: null };
  const franchise = { size_group_derived: { anime: "12ep" }, size_group_manual: null };

  it("inherits from the series", () => {
    expect(entryBucket("anime", null, series, franchise)).toBe("24ep");
  });

  it("falls back to the franchise", () => {
    expect(entryBucket("anime", null, null, franchise)).toBe("12ep");
  });

  it("falls back when the series lacks that media type key", () => {
    const other = { size_group_derived: { "tv-show": "2season" }, size_group_manual: null };
    expect(entryBucket("anime", null, other, franchise)).toBe("12ep");
  });

  it("buckets a comic on its own issue total, ignoring its series", () => {
    const comicSeries = { size_group_derived: { comic: "11_plus" }, size_group_manual: null };
    expect(entryBucket("comic", 5, comicSeries, null)).toBe("4_10");
    expect(entryBucket("comic", 3, comicSeries, null)).toBe("1_3");
    expect(entryBucket("comic", 11, comicSeries, null)).toBe("11_plus");
  });

  it("gives a comic with no issue total no bucket", () => {
    expect(entryBucket("comic", null, null, null)).toBeNull();
  });

  it("returns null with no group at all", () => {
    expect(entryBucket("anime", null, null, null)).toBeNull();
  });
});

describe("groupByBucket", () => {
  it("keys every bucket in vocabulary order plus ungrouped", () => {
    const grouped = groupByBucket([], "anime");
    expect(Object.keys(grouped)).toEqual(["12ep", "24ep", "30ep_plus", "ungrouped"]);
  });

  it("files rows by their bucket field", () => {
    const rows = [
      { id: 1, bucket: "12ep" },
      { id: 2, bucket: "12ep" },
      { id: 3, bucket: null },
    ];
    const grouped = groupByBucket(rows, "anime");
    expect(grouped["12ep"]).toHaveLength(2);
    expect(grouped.ungrouped).toHaveLength(1);
    expect(grouped["24ep"]).toEqual([]);
  });

  it("puts everything in ungrouped for an unbucketed media type", () => {
    const grouped = groupByBucket([{ id: 1, bucket: null }], "manga");
    expect(Object.keys(grouped)).toEqual(["ungrouped"]);
    expect(grouped.ungrouped).toHaveLength(1);
  });
});
