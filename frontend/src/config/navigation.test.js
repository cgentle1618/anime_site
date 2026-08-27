import { describe, expect, it } from "vitest";

import {
  NAV_SECTIONS,
  activeItem,
  activeSectionKey,
  sectionItems,
} from "./navigation";

describe("activeSectionKey", () => {
  it("lights up the tab a library page belongs to", () => {
    expect(activeSectionKey("/library/anime")).toBe("library");
    expect(activeSectionKey("/plan")).toBe("track");
    expect(activeSectionKey("/statistics")).toBe("insights");
    expect(activeSectionKey("/add")).toBe("admin");
  });

  it("lights up the library tab from a media detail page", () => {
    expect(activeSectionKey("/anime/1234")).toBe("library");
    expect(activeSectionKey("/franchise/77")).toBe("library");
    expect(activeSectionKey("/series/77")).toBe("library");
    expect(activeSectionKey("/watch-order/77")).toBe("library");
  });

  it("does not let one library prefix claim another", () => {
    // "/library/anime" must not swallow "/library/anime-movie", and
    // "/anime/12" must not be read as an anime-movie detail page.
    expect(activeItem("/library/anime-movie").item.label).toBe("Anime Movie");
    expect(activeItem("/anime-movie/12").item.label).toBe("Anime Movie");
    expect(activeItem("/anime/12").item.label).toBe("Anime");
  });

  it("keeps seasonal detail pages under Track", () => {
    expect(activeSectionKey("/seasonal")).toBe("track");
    expect(activeSectionKey("/seasonal/2024-Spring")).toBe("track");
  });

  it("returns null on routes that own no tab", () => {
    expect(activeSectionKey("/")).toBeNull();
    expect(activeSectionKey("/login")).toBeNull();
    expect(activeSectionKey("/search")).toBeNull();
  });
});

describe("NAV_SECTIONS", () => {
  it("groups Collection and Franchise apart from ACG and Reality", () => {
    const library = NAV_SECTIONS.find((s) => s.key === "library");
    const groups = library.columns.find((c) => c.heading === "Groups");
    expect(groups.items.map((i) => i.label)).toEqual([
      "Collection",
      "Franchise",
    ]);
  });

  it("keeps Watch Orders and Relations in Admin only", () => {
    const owners = NAV_SECTIONS.filter((s) =>
      sectionItems(s).some((i) => i.to === "/watch-orders"),
    );
    expect(owners.map((s) => s.key)).toEqual(["admin"]);
  });

  it("marks Admin as the only admin-gated section", () => {
    expect(NAV_SECTIONS.filter((s) => s.adminOnly).map((s) => s.key)).toEqual([
      "admin",
    ]);
  });
});
