import { describe, expect, it } from "vitest";

import { MEDIA_TYPES } from "./fieldOptions";
import { USAGES } from "../components/forms/UsagePicker";
import { SCOPE_CHIPS, scopeChip, USAGE_CHIPS, usageChip } from "./scopeColors";

describe("scope chip colours", () => {
  it("covers every media type key the scope picker offers", () => {
    expect(Object.keys(SCOPE_CHIPS).sort()).toEqual([...MEDIA_TYPES].sort());
  });

  it("gives each media type a distinct chip", () => {
    const chips = MEDIA_TYPES.map(scopeChip);
    expect(new Set(chips).size).toBe(MEDIA_TYPES.length);
  });

  it("draws its colour from scope tokens, never a raw palette colour", () => {
    // Design rule: "New colour -> add a token to index.css in both palettes,
    // never a raw hex in a component." A Tailwind palette utility here would
    // also break rule 1 and would be tuned for a white page, not bone paper.
    const PALETTE =
      /(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/;
    for (const chip of Object.values(SCOPE_CHIPS)) {
      expect(chip).toMatch(/bg-scope-[a-z-]+\/\d+/);
      expect(chip).toMatch(/border-scope-[a-z-]+\/\d+/);
      expect(chip).toMatch(/text-scope-[a-z-]+(?!\/)/);
      expect(chip).not.toMatch(PALETTE);
      expect(chip).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("falls back to a neutral chip for an unknown scope", () => {
    // A scope row can hold a key this build does not know yet (an older
    // frontend against a newer database); it must still render.
    expect(scopeChip("holodeck")).toBe(scopeChip(undefined));
    expect(scopeChip("holodeck")).not.toContain("scope-");
  });
});

describe("usage chip colours", () => {
  it("covers every usage the usage picker offers", () => {
    expect(Object.keys(USAGE_CHIPS).sort()).toEqual([...USAGES].sort());
  });

  it("gives each usage a distinct chip", () => {
    const chips = USAGES.map(usageChip);
    expect(new Set(chips).size).toBe(USAGES.length);
  });

  it("draws its colour from scope tokens, never a raw palette colour", () => {
    const PALETTE =
      /(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/;
    for (const chip of Object.values(USAGE_CHIPS)) {
      expect(chip).toMatch(/bg-scope-[a-z-]+\/\d+/);
      expect(chip).toMatch(/border-scope-[a-z-]+\/\d+/);
      expect(chip).toMatch(/text-scope-[a-z-]+(?!\/)/);
      expect(chip).not.toMatch(PALETTE);
      expect(chip).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("falls back to a neutral chip for an unknown usage", () => {
    expect(usageChip("holodeck")).toBe(usageChip(undefined));
    expect(usageChip("holodeck")).not.toContain("scope-");
  });
});
