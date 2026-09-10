import { describe, expect, it } from "vitest";

import {
  NAV_SECTIONS,
  activeItem,
  activeSectionKey,
  itemRequirement,
  sectionItems,
  sectionRequirement,
  visibleSections,
} from "./navigation";

// The section a route's item sits in, by key.
function ownersOf(to) {
  return NAV_SECTIONS.filter((s) =>
    sectionItems(s).some((i) => i.to === to),
  ).map((s) => s.key);
}

describe("activeSectionKey", () => {
  it("lights up the tab a library page belongs to", () => {
    expect(activeSectionKey("/library/anime")).toBe("library");
    expect(activeSectionKey("/plan")).toBe("track");
    expect(activeSectionKey("/statistics")).toBe("insights");
    expect(activeSectionKey("/add")).toBe("entry");
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

  it("keeps the credited entities in their own column, not Groups", () => {
    const library = NAV_SECTIONS.find((s) => s.key === "library");
    const entities = library.columns.find((c) => c.heading === "Entities");
    expect(entities.items.map((i) => i.label)).toEqual([
      "Studio",
      "Publisher",
      "Person",
      "Character",
    ]);
  });

  it("lists Game in the ACG column - ACG is anime, comic and games", () => {
    const library = NAV_SECTIONS.find((s) => s.key === "library");
    const acg = library.columns.find((c) => c.heading === "ACG");
    expect(acg.items.map((i) => i.label)).toContain("Game");
    expect(activeItem("/library/game").item.label).toBe("Game");
    expect(activeItem("/game/12").item.label).toBe("Game");
  });

  it("gathers the four entry forms under their own Entry tab", () => {
    const entry = NAV_SECTIONS.find((s) => s.key === "entry");
    expect(sectionItems(entry).map((i) => i.to)).toEqual([
      "/add",
      "/modify",
      "/delete",
      "/defaults",
    ]);
  });

  it("gathers the three read-only inventories under a Note tab", () => {
    // System Options, its alias translations, and which columns each external
    // API writes: three read-only views over how the data is described.
    const note = NAV_SECTIONS.find((s) => s.key === "note");
    expect(sectionItems(note).map((i) => i.to)).toEqual([
      "/options",
      "/aliases",
      "/external-apis",
    ]);
    expect(activeSectionKey("/external-apis")).toBe("note");
  });

  it("reads Relations and Watch Orders as Insights, admin-gated", () => {
    // They belong with the other ways of looking at the collection, but stay
    // admin-only inside a tab everyone can open.
    expect(ownersOf("/relations")).toEqual(["insights"]);
    expect(ownersOf("/watch-orders")).toEqual(["insights"]);

    const insights = NAV_SECTIONS.find((s) => s.key === "insights");
    const gated = sectionItems(insights)
      .filter((i) => !i.divider && itemRequirement(i) === "admin")
      .map((i) => i.to);
    expect(gated).toEqual(["/relations", "/watch-orders"]);
    expect(itemRequirement({ to: "/statistics" })).toBeNull();
  });

  it("leaves the Admin tab holding only the system-wide pages", () => {
    const admin = NAV_SECTIONS.find((s) => s.key === "admin");
    expect(sectionItems(admin).map((i) => i.to)).toEqual([
      "/system",
      "/data-history",
      "/review-queue",
      undefined, // divider
      "/users",
      "/roles",
      "/content-labels",
    ]);
  });

  it("gates Entry, Note and Admin on the admin permission", () => {
    const gated = NAV_SECTIONS.filter((s) => sectionRequirement(s) !== null);
    expect(gated.map((s) => s.key)).toEqual(["entry", "note", "admin"]);
    expect(gated.every((s) => sectionRequirement(s) === "admin")).toBe(true);
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

  it("drops the admin-only rows from a section a guest may open", () => {
    const [insights] = visibleSections(NAV_SECTIONS, holdsNothing).filter(
      (s) => s.key === "insights",
    );
    const routes = sectionItems(insights).map((i) => i.to);
    expect(routes).not.toContain("/relations");
    expect(routes).not.toContain("/watch-orders");
  });

  it("hides the per-user rows from a logged-out visitor", () => {
    // Plan, Seasonal and Statistics are per-user pages: their APIs answer 401
    // and their routes redirect to login, so the rows would only bounce a
    // guest. self.list is the nav's spelling of "a signed-in member".
    const holdsSelfList = (p) => p === "self.list";
    const routesFor = (has) =>
      visibleSections(NAV_SECTIONS, has).flatMap((s) =>
        sectionItems(s).map((i) => i.to),
      );

    const forGuest = routesFor(holdsNothing);
    expect(forGuest).not.toContain("/plan");
    expect(forGuest).not.toContain("/seasonal");
    expect(forGuest).not.toContain("/statistics");

    const forMember = routesFor(holdsSelfList);
    expect(forMember).toContain("/plan");
    expect(forMember).toContain("/seasonal");
    expect(forMember).toContain("/statistics");
  });

  it("shows Settings to a member holding self.list and to nobody else", () => {
    // The one row a signed-in non-admin has of their own, which is why it is
    // an item-level requirement inside a section a guest may open rather than
    // a row in the wholly admin-gated Admin section.
    const holdsSelfList = (p) => p === "self.list";

    const forGuest = visibleSections(NAV_SECTIONS, holdsNothing)
      .filter((s) => s.key === "insights")
      .flatMap((s) => sectionItems(s).map((i) => i.to));
    expect(forGuest).not.toContain("/settings");

    const forMember = visibleSections(NAV_SECTIONS, holdsSelfList)
      .filter((s) => s.key === "insights")
      .flatMap((s) => sectionItems(s).map((i) => i.to));
    expect(forMember).toContain("/settings");
    // A member is still not an admin.
    expect(forMember).not.toContain("/watch-orders");
  });

  it("keeps them for an admin, and keeps item identity intact", () => {
    const [insights] = visibleSections(NAV_SECTIONS, holdsEverything).filter(
      (s) => s.key === "insights",
    );
    // Nav marks the current row by object identity, so filtering must hand
    // back the very same item objects, not copies.
    expect(sectionItems(insights)).toEqual(
      sectionItems(NAV_SECTIONS.find((s) => s.key === "insights")),
    );
    expect(activeItem("/watch-orders").item).toBe(
      sectionItems(insights).find((i) => i.to === "/watch-orders"),
    );
  });

  it("hides a section whose every row the viewer lacks", () => {
    const sections = [
      {
        key: "secret",
        label: "Secret",
        items: [{ label: "Hidden", to: "/hidden", requires: "admin" }],
      },
    ];
    expect(visibleSections(sections, holdsNothing)).toEqual([]);
    expect(visibleSections(sections, holdsEverything)).toEqual(sections);
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
