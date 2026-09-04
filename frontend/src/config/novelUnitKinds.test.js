import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NOVEL_UNIT_KINDS_BY_TYPE } from "../lib/novelUnits";

// Reads the Python source rather than importing it: the guard has to fail
// when the backend map changes, which a duplicated JS copy could never do.
const constants = fs.readFileSync(
  path.resolve(__dirname, "../../../app/utils/constants.py"),
  "utf8",
);

describe("novel unit kinds", () => {
  it("matches the backend map", () => {
    const block = constants.match(
      /NOVEL_UNIT_KINDS_BY_TYPE = \{([\s\S]*?)\n\}/,
    );
    expect(block).not.toBeNull();

    const parsed = {};
    for (const line of block[1].split("\n")) {
      const m = line.match(/"([^"]+)":\s*\(([^)]*)\)/);
      if (!m) continue;
      parsed[m[1]] = m[2]
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    }

    // Guard the guard: an empty or partial parse (e.g. from a reformat of
    // constants.py) must fail loudly rather than vacuously passing an
    // {} === {} comparison.
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
    for (const novelType of ["Light Novel", "Novel", "Web", "Other"]) {
      expect(parsed).toHaveProperty(novelType);
    }

    expect(parsed).toEqual(NOVEL_UNIT_KINDS_BY_TYPE);
  });
});
