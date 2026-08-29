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

describe("entryBucket: manga groups by serialization status", () => {
  const series = { size_group_derived: { manga: "ignored" }, size_group_manual: null };

  it("uses the entry's own serialization status", () => {
    expect(entryBucket("manga", "連載中", series, null)).toBe("連載中");
    expect(entryBucket("manga", "完結", null, null)).toBe("完結");
    expect(entryBucket("manga", "腰斬", null, null)).toBe("腰斬");
    expect(entryBucket("manga", "停更", null, null)).toBe("停更");
  });

  it("never inherits from its series or franchise", () => {
    const franchise = { size_group_derived: { manga: "x" }, size_group_manual: null };
    expect(entryBucket("manga", null, series, franchise)).toBeNull();
  });

  it("gives a missing or unknown status no bucket, so it lands in the trailing group", () => {
    expect(entryBucket("manga", null, null, null)).toBeNull();
    expect(entryBucket("manga", "休刊", null, null)).toBeNull();
  });
});

describe("entryBucket: novel groups by type", () => {
  it("uses the entry's own type", () => {
    expect(entryBucket("novel", "Web", null, null)).toBe("Web");
    expect(entryBucket("novel", "Light Novel", null, null)).toBe("Light Novel");
    expect(entryBucket("novel", "Novel", null, null)).toBe("Novel");
    expect(entryBucket("novel", "Other", null, null)).toBe("Other");
  });

  it("folds a missing or unknown type into Other, unlike manga", () => {
    expect(entryBucket("novel", null, null, null)).toBe("Other");
    expect(entryBucket("novel", "Serial", null, null)).toBe("Other");
  });

  it("never inherits from its series or franchise", () => {
    const series = { size_group_derived: { novel: "Web" }, size_group_manual: null };
    expect(entryBucket("novel", "Novel", series, null)).toBe("Novel");
  });
});

describe("groupByBucket: manga and novel vocabularies", () => {
  it("keys manga in vocabulary order plus a trailing ungrouped pile", () => {
    expect(Object.keys(groupByBucket([], "manga"))).toEqual([
      "完結", "連載中", "腰斬", "停更", "ungrouped",
    ]);
  });

  it("leads novel with Web, unlike the form dropdown order", () => {
    expect(Object.keys(groupByBucket([], "novel"))).toEqual([
      "Web", "Light Novel", "Novel", "Other", "ungrouped",
    ]);
  });

  it("files a statusless manga into ungrouped and a typeless novel into Other", () => {
    const manga = groupByBucket([{ id: 1, bucket: entryBucket("manga", null) }], "manga");
    expect(manga.ungrouped).toHaveLength(1);

    const novel = groupByBucket([{ id: 1, bucket: entryBucket("novel", null) }], "novel");
    expect(novel.Other).toHaveLength(1);
    expect(novel.ungrouped).toHaveLength(0);
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

  // anime-movie is the only type with no grouping at all: the five size-bucket
  // types inherit one, and comic/manga/novel each group by their own column.
  it("puts everything in ungrouped for an unbucketed media type", () => {
    const grouped = groupByBucket([{ id: 1, bucket: null }], "anime-movie");
    expect(Object.keys(grouped)).toEqual(["ungrouped"]);
    expect(grouped.ungrouped).toHaveLength(1);
  });
});
