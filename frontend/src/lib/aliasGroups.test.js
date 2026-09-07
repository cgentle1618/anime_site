import { describe, expect, it } from "vitest";

import { groupAliasesBySource } from "./aliasGroups";

const OPTIONS = [
  {
    category: "Game Genre",
    value: "角色扮演",
    scopes: ["game"],
    aliases: [
      { source: "igdb", value: "Role-playing (RPG)" },
      { source: "igdb", value: "RPG" },
    ],
  },
  {
    category: "Game Genre",
    value: "射擊",
    scopes: ["game"],
    aliases: [{ source: "igdb", value: "Shooter" }],
  },
  // In an aliased category, but carrying no alias of its own.
  { category: "Game Genre", value: "獨立", scopes: ["game"], aliases: [] },
  {
    category: "Game Theme",
    value: "動作",
    scopes: ["game"],
    aliases: [{ source: "igdb", value: "Action" }],
  },
  // A category no API touches at all.
  { category: "Combat Mode", value: "PvE", scopes: ["game"], aliases: [] },
];

describe("groupAliasesBySource", () => {
  it("keys the table by the external string, not by the stored value", () => {
    // The page answers "IGDB said X; what is that?", the opposite of the
    // question GET /api/options/ is shaped for.
    const [igdb] = groupAliasesBySource(OPTIONS);
    const genres = igdb.categories.find((c) => c.category === "Game Genre");
    // Sorted by the external name, case- and accent-insensitively, so an
    // admin can scan for the string IGDB actually sent.
    expect(genres.rows).toEqual([
      { external: "Role-playing (RPG)", value: "角色扮演", scopes: ["game"] },
      { external: "RPG", value: "角色扮演", scopes: ["game"] },
      { external: "Shooter", value: "射擊", scopes: ["game"] },
    ]);
  });

  it("counts every row under its source", () => {
    const [igdb] = groupAliasesBySource(OPTIONS);
    expect(igdb.source).toBe("igdb");
    expect(igdb.total).toBe(4);
  });

  it("lists the values an aliased category leaves unreachable", () => {
    // 獨立 sits in a category IGDB fills, but nothing IGDB can say maps to
    // it. That gap is invisible from the options side and is the reason this
    // page exists.
    const [igdb] = groupAliasesBySource(OPTIONS);
    const genres = igdb.categories.find((c) => c.category === "Game Genre");
    expect(genres.unaliased).toEqual(["獨立"]);
  });

  it("leaves out categories no source names at all", () => {
    // Combat Mode is not an IGDB field. Listing it with every value
    // unaliased would report a gap that is not one.
    const [igdb] = groupAliasesBySource(OPTIONS);
    expect(igdb.categories.map((c) => c.category)).toEqual([
      "Game Genre",
      "Game Theme",
    ]);
  });

  it("returns nothing when no option carries an alias", () => {
    expect(groupAliasesBySource([{ category: "X", value: "y" }])).toEqual([]);
    expect(groupAliasesBySource([])).toEqual([]);
    expect(groupAliasesBySource(undefined)).toEqual([]);
  });
});
