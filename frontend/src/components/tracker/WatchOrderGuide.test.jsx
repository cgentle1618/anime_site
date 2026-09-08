// Unit tests for buildBlocks — the rule that turns a flat step list into the
// part boxes and loose runs both the guide and the editor draw.
//
// A part is whichever run of *adjacent* steps shares a section_id, so the
// server's reading order is the only input that matters: parts never reorder
// anything, and an unfiled step may sit before, between or after them.
import { describe, expect, it } from "vitest";

import { buildBlocks } from "./WatchOrderGuide";

const step = (id, position, section_id = null) => ({
  system_id: id,
  position,
  section_id,
});
const part = (id, position, name) => ({
  system_id: id,
  position,
  section_name: name,
});

/** ["part:Part 1:a,b", "loose:c"] — the shape asserted against. */
const shape = (blocks) =>
  blocks.map((b) =>
    [
      b.kind,
      ...(b.kind === "part" ? [b.section.section_name] : []),
      b.rows.map((r) => r.item.system_id).join(","),
    ].join(":")
  );

const numbers = (blocks) => blocks.flatMap((b) => b.rows.map((r) => r.number));

describe("buildBlocks", () => {
  it("leaves a list with no parts as one loose run", () => {
    const blocks = buildBlocks([step("a", 1), step("b", 2)], []);
    expect(shape(blocks)).toEqual(["loose:a,b"]);
  });

  it("returns nothing for an empty list", () => {
    expect(buildBlocks([], [])).toEqual([]);
  });

  it("wraps a run of steps sharing a part into one box", () => {
    const one = part("s1", 1, "Part 1");
    const blocks = buildBlocks(
      [step("a", 1, "s1"), step("b", 2, "s1"), step("c", 3, "s1")],
      [one]
    );
    expect(shape(blocks)).toEqual(["part:Part 1:a,b,c"]);
  });

  it("lets an unfiled step sit between two parts", () => {
    // The arrangement the tier was rewritten to allow.
    const blocks = buildBlocks(
      [step("a", 1, "s1"), step("loose", 2), step("c", 3, "s2")],
      [part("s1", 1, "Part 1"), part("s2", 2, "Part 2")]
    );
    expect(shape(blocks)).toEqual([
      "part:Part 1:a",
      "loose:loose",
      "part:Part 2:c",
    ]);
  });

  it("lets an unfiled step sit before every part", () => {
    const blocks = buildBlocks(
      [step("loose", 1), step("a", 2, "s1")],
      [part("s1", 1, "Part 1")]
    );
    expect(shape(blocks)).toEqual(["loose:loose", "part:Part 1:a"]);
  });

  it("lets an unfiled step sit after every part", () => {
    const blocks = buildBlocks(
      [step("a", 1, "s1"), step("loose", 2)],
      [part("s1", 1, "Part 1")]
    );
    expect(shape(blocks)).toEqual(["part:Part 1:a", "loose:loose"]);
  });

  it("draws a part where its steps read, not where its position says", () => {
    // Part 2 carries the later position; its step still reads first.
    const blocks = buildBlocks(
      [step("a", 1, "s2"), step("b", 2, "s1")],
      [part("s1", 1, "Part 1"), part("s2", 9, "Part 2")]
    );
    expect(shape(blocks)).toEqual(["part:Part 2:a", "part:Part 1:b"]);
  });

  it("numbers steps 1..N straight through the parts", () => {
    // The reader counts steps, not steps-within-a-part.
    const blocks = buildBlocks(
      [step("a", 1, "s1"), step("b", 2, "s1"), step("c", 3), step("d", 4, "s2")],
      [part("s1", 1, "Part 1"), part("s2", 2, "Part 2")]
    );
    expect(numbers(blocks)).toEqual([1, 2, 3, 4]);
  });

  it("keeps a step whose part no longer exists, as a loose one", () => {
    // A deleted part, or a hand-edited Sheets restore naming another order's.
    // It must stay visible so an admin can see and fix it.
    const blocks = buildBlocks([step("a", 1, "gone"), step("b", 2)], []);
    expect(shape(blocks)).toEqual(["loose:a,b"]);
  });

  describe("empty parts", () => {
    it("are left out of the guide, which has nothing to wrap", () => {
      const blocks = buildBlocks([step("a", 1)], [part("s1", 5, "Part 1")]);
      expect(shape(blocks)).toEqual(["loose:a"]);
    });

    it("are drawn for the editor, anchored by their own position", () => {
      const blocks = buildBlocks(
        [step("a", 1), step("b", 3)],
        [part("s1", 2, "Part 1")],
        { includeEmpty: true }
      );
      expect(shape(blocks)).toEqual(["loose:a", "part:Part 1:", "loose:b"]);
    });

    it("anchored past the last step are drawn at the end", () => {
      const blocks = buildBlocks(
        [step("a", 1)],
        [part("s1", 9, "Part 1")],
        { includeEmpty: true }
      );
      expect(shape(blocks)).toEqual(["loose:a", "part:Part 1:"]);
    });

    it("are drawn even when the order holds no steps at all", () => {
      const blocks = buildBlocks([], [part("s1", 1, "Part 1")], {
        includeEmpty: true,
      });
      expect(shape(blocks)).toEqual(["part:Part 1:"]);
    });

    it("do not steal a box from a part that has steps", () => {
      const blocks = buildBlocks(
        [step("a", 1, "s1")],
        [part("s1", 1, "Part 1"), part("s2", 2, "Part 2")],
        { includeEmpty: true }
      );
      expect(shape(blocks)).toEqual(["part:Part 1:a", "part:Part 2:"]);
    });
  });
});
