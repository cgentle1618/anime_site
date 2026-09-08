// A tripwire, not a unit test: the eight detail pages used to reach into
// source_other and baha_link directly. Once sources arrive as rows, any
// surviving reference is a bug.
//
// This test matches raw text, comments included, and that is deliberate: a
// comment naming a dead field is itself a small piece of rot, and forcing
// prose to avoid the token keeps the vocabulary clean. If this test ever
// flags a comment rather than code, reword the comment - do not add an
// exclusion. An exclusion silently removes a whole subtree from the guard,
// which is far more expensive than a rephrased sentence.
//
// "source_official" is deliberately NOT in this list. It is not a dead
// field - it is the LIVE response attribute for tv-show and cartoon's
// original-source tag, under the same legacy-sheet-column convention that
// exposes anime.publisher_tw as "distributor_tw" and manga.author as
// "author_plot" (see sheet_column_for / legacy_link_fields in
// app/utils/credit_roles.py and app/services/domain/credits.py). Movie
// never had a legacy sheet column for this tag, so it alone is exposed
// under the canonical key "original_source". Do not add "source_official"
// back here - the two real dead names it could be confused with
// (source_baha, source_netflix) are already listed below.
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
];

const ROOTS = ["src"];

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
