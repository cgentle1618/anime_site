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

  it("gives every Entity tab a form-defaults tab", () => {
    // Studio, Person and Character are not media entries, but each has an Add
    // form whose starting values the admin configures on /defaults.
    const keys = FORM_TABS.map((t) => t.key);
    expect(keys).toEqual(
      expect.arrayContaining(["studio", "person", "character"]),
    );
  });

  it("keeps the formless tabs out of the form-defaults tabs", () => {
    // These three have no form factory: System Options edits a vocabulary,
    // Quote and Meme have no defaultable fields.
    const keys = FORM_TABS.map((t) => t.key);
    expect(keys).not.toContain("options");
    expect(keys).not.toContain("quote");
    expect(keys).not.toContain("meme");
  });
});
