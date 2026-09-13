import { describe, expect, it } from "vitest";

import { homelessLabelKeys } from "./AccessModes";

/**
 * A content label that no access mode carries hides its entries from
 * everyone, the owner included. That is correct - fail-closed is the right
 * direction - but it is invisible everywhere else in the app, so this page is
 * the only place it can be noticed. These pin when the warning appears.
 */

const catalog = [
  {
    group: "label",
    label: "Content Labels",
    items: [
      { key: "nsfw", label: "NSFW", mode_count: 1 },
      { key: "spoiler", label: "Spoiler", mode_count: 0 },
    ],
  },
  { group: "field_group", label: "Field Groups", items: [] },
];

const modes = [
  { system_id: "wide", label_keys: ["nsfw"] },
  { system_id: "narrow", label_keys: [] },
];

describe("homelessLabelKeys", () => {
  it("flags a label no mode carries", () => {
    const homeless = homelessLabelKeys(catalog, modes, "narrow", new Set());
    expect(homeless.has("spoiler")).toBe(true);
  });

  it("does not flag a label another mode carries", () => {
    const homeless = homelessLabelKeys(catalog, modes, "narrow", new Set());
    expect(homeless.has("nsfw")).toBe(false);
  });

  it("warns the moment the last mode carrying it is unticked", () => {
    // Editing `wide`, which is the only mode carrying nsfw, and the draft no
    // longer has it. The row is still saved that way - the warning has to
    // come from the DRAFT or it would arrive after a save and a reload, by
    // which point it is a record rather than a warning.
    const homeless = homelessLabelKeys(catalog, modes, "wide", new Set());
    expect(homeless.has("nsfw")).toBe(true);
  });

  it("stops warning as soon as it is ticked back on", () => {
    const homeless = homelessLabelKeys(
      catalog,
      modes,
      "wide",
      new Set(["nsfw"]),
    );
    expect(homeless.has("nsfw")).toBe(false);
  });

  it("counts the draft for the selected mode, not its saved row", () => {
    // `narrow` does not carry nsfw on the server, but the draft does - so it
    // is not homeless, because saving would give it a home.
    const homeless = homelessLabelKeys(
      catalog,
      [{ system_id: "narrow", label_keys: [] }],
      "narrow",
      new Set(["nsfw"]),
    );
    expect(homeless.has("nsfw")).toBe(false);
  });

  it("is empty when there are no labels at all", () => {
    const empty = [{ group: "label", label: "Content Labels", items: [] }];
    expect(homelessLabelKeys(empty, modes, "narrow", new Set()).size).toBe(0);
  });
});
