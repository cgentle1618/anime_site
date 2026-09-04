import { describe, it, expect, afterEach } from "vitest";

import { TAG_CATEGORIES, applyConstants } from "../config/fieldOptions";
import { categoriesForSubTab, isTagCategory } from "./optionCategoryGroups";
import { OPTION_SUB_TABS } from "../components/forms/OptionSubTabBar";

// applyConstants mutates TAG_CATEGORIES in place, so restore its real
// contents after any test that overwrites them.
const ORIGINAL_TAG_CATEGORIES = [...TAG_CATEGORIES];
afterEach(() => {
  applyConstants({ tag_categories: ORIGINAL_TAG_CATEGORIES });
});

const ALL = [
  "Comic Era",
  "Genre Main",
  "Genre Sub",
  "Label",
  "Official Source",
  "Quality",
];

describe("isTagCategory", () => {
  it("recognises the tag categories", () => {
    expect(isTagCategory("Quality")).toBe(true);
    expect(isTagCategory("Genre Main")).toBe(true);
  });

  it("leaves the ones that name an outside party alone", () => {
    expect(isTagCategory("Comic Era")).toBe(false);
    expect(isTagCategory("Publisher / Distributor TW")).toBe(false);
  });

  it("follows /api/constants rather than a copy of the list", () => {
    applyConstants({ tag_categories: ["Comic Era"] });
    expect(isTagCategory("Comic Era")).toBe(true);
    expect(isTagCategory("Quality")).toBe(false);
  });
});

describe("categoriesForSubTab", () => {
  it("splits the categories across the two pickers with nothing lost", () => {
    const tags = categoriesForSubTab(ALL, "tags");
    const options = categoriesForSubTab(ALL, "options");
    expect(tags).toEqual(["Genre Main", "Genre Sub", "Label", "Quality"]);
    expect(options).toEqual(["Comic Era", "Official Source"]);
    expect([...tags, ...options].sort()).toEqual([...ALL].sort());
  });

  it("offers no categories on a sub-tab that has no category picker", () => {
    expect(categoriesForSubTab(ALL, "people")).toEqual([]);
    expect(categoriesForSubTab(ALL, "studios")).toEqual([]);
  });
});

describe("OPTION_SUB_TABS", () => {
  it("no longer offers Studios under System Option", () => {
    expect(OPTION_SUB_TABS.map((t) => t.key)).not.toContain("studios");
  });
});
