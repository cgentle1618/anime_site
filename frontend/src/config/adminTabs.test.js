import { describe, expect, it } from "vitest";
import { ADMIN_TABS, FORM_TABS, TAB_GROUPS, groupOf } from "./adminTabs";

describe("admin tab groups", () => {
  it("offers an Entity group beside Entries and Structure", () => {
    expect(TAB_GROUPS.map((g) => g.key)).toEqual([
      "entries",
      "structure",
      "entity",
    ]);
  });

  it("puts Studio in the Entity group", () => {
    expect(groupOf(ADMIN_TABS, "studio")).toBe("entity");
  });

  it("keeps Studio out of the form-defaults tabs", () => {
    // A studio is not a media entry and has no default field values,
    // like options / quote / meme.
    expect(FORM_TABS.map((t) => t.key)).not.toContain("studio");
  });
});
