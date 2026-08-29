import { describe, expect, it } from "vitest";

import {
  NAV_SECTIONS,
  activeItem,
  activeSectionKey,
  sectionItems,
  sectionRequirement,
  visibleSections,
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

  it("offers System Options from the Admin dropdown, admin-gated", () => {
    const owners = NAV_SECTIONS.filter((s) =>
      sectionItems(s).some((i) => i.to === "/options"),
    );
    expect(owners.map((s) => s.key)).toEqual(["admin"]);
  });

  it("marks Admin as the only permission-gated section", () => {
    const gated = NAV_SECTIONS.filter((s) => sectionRequirement(s) !== null);
    expect(gated.map((s) => s.key)).toEqual(["admin"]);
    expect(sectionRequirement(gated[0])).toBe("admin");
  });
});

describe("visibleSections", () => {
  const holdsNothing = () => false;
  const holdsEverything = () => true;

  it("hides a section whose permission the viewer lacks", () => {
    const keys = visibleSections(NAV_SECTIONS, holdsNothing).map((s) => s.key);
    expect(keys).not.toContain("admin");
  });

  it("shows it once the viewer holds the permission", () => {
    const keys = visibleSections(NAV_SECTIONS, holdsEverything).map(
      (s) => s.key,
    );
    expect(keys).toContain("admin");
  });

  it("leaves ungated sections alone either way", () => {
    const keys = visibleSections(NAV_SECTIONS, holdsNothing).map((s) => s.key);
    expect(keys).toContain("library");
    expect(keys).toContain("insights");
  });

  it("still understands the older adminOnly spelling", () => {
    const legacy = [{ key: "legacy", label: "Legacy", adminOnly: true }];
    expect(sectionRequirement(legacy[0])).toBe("admin");
    expect(visibleSections(legacy, holdsNothing)).toEqual([]);
    expect(visibleSections(legacy, holdsEverything)).toEqual(legacy);
  });

  it("asks for the exact permission the section names", () => {
    const asked = [];
    visibleSections(NAV_SECTIONS, (p) => {
      asked.push(p);
      return true;
    });
    expect(asked).toContain("admin");
  });
});
