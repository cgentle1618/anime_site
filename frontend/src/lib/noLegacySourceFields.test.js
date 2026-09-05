// A tripwire, not a unit test: the eight detail pages used to reach into
// source_other and baha_link directly. Once sources arrive as rows, any
// surviving reference is a bug.
//
// The walk is deliberately scoped to src/pages/detail and src/components
// rather than all of src: add-tabs/, modify-tabs/, admin/,
// config/formFactories.js, config/formFields/fieldMeta.js, lib/payloads.js
// and lib/formatters.js still legitimately reference these dead field names
// until a later task migrates them. That narrowness is temporary and
// intentional, not an oversight — widen the walk root to "src" once that
// migration lands.
//
// This test matches raw text, comments included, and that is deliberate: a
// comment naming a dead field is itself a small piece of rot, and forcing
// prose to avoid the token keeps the vocabulary clean. If this test ever
// flags a comment rather than code, reword the comment - do not add an
// exclusion. An exclusion silently removes a whole subtree from the guard,
// which is far more expensive than a rephrased sentence.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DEAD = [
  "source_other",
  "baha_link",
  "source_netflix",
  "source_baha",
  "anilist_link",
  "official_link",
  "twitter_link",
  "source_official",
];

const ROOTS = ["src/pages/detail", "src/components"];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name))
      : e.name.endsWith(".jsx") || e.name.endsWith(".js")
        ? [join(dir, e.name)]
        : [],
  );
}

describe("legacy source fields", () => {
  it("are gone from the migrated detail pages and components", () => {
    const offenders = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (file.includes("noLegacySourceFields")) continue;
        const text = readFileSync(file, "utf8");
        for (const dead of DEAD) {
          if (text.includes(dead)) offenders.push(`${file}: ${dead}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
