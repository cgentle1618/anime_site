import { describe, expect, it } from "vitest";
import { arcStep, kindsForType, unitDisplayKey } from "./novelUnits";

describe("unitDisplayKey", () => {
  it("uses the explicit key when there is one", () => {
    expect(unitDisplayKey("volume", 1, "第一卷")).toBe("第一卷");
  });

  it("generates a key from kind and position otherwise", () => {
    expect(unitDisplayKey("volume", 1, "")).toBe("Vol 1");
    expect(unitDisplayKey("arc", 2, null)).toBe("Arc 2");
    expect(unitDisplayKey("story", 3, "   ")).toBe("Story 3");
    expect(unitDisplayKey("chapter", 4, undefined)).toBe("Ch 4");
  });

  it("keeps a fractional position", () => {
    expect(unitDisplayKey("volume", 1.5, null)).toBe("Vol 1.5");
  });
});

describe("kindsForType", () => {
  it("maps each novel type to its kinds", () => {
    expect(kindsForType("Light Novel")).toEqual(["volume"]);
    expect(kindsForType("Novel")).toEqual(["volume"]);
    expect(kindsForType("Web")).toEqual(["arc"]);
    expect(kindsForType("Other")).toEqual(["volume", "story", "chapter"]);
  });

  it("falls back to volume for an unknown type", () => {
    expect(kindsForType(null)).toEqual(["volume"]);
  });
});

describe("arcStep", () => {
  const arcs = [{ ch_count: 100 }, { ch_count: 112 }];

  it("steps forward inside the current arc", () => {
    expect(arcStep(arcs, 1, 100, 1)).toEqual({ arc_fin: 1, ch_fin_in_arc: 101 });
  });

  it("rolls into the next arc when the current one completes", () => {
    expect(arcStep(arcs, 1, 111, 1)).toEqual({ arc_fin: 2, ch_fin_in_arc: 0 });
  });

  it("borrows from the previous arc when stepping back past zero", () => {
    expect(arcStep(arcs, 1, 0, -1)).toEqual({ arc_fin: 0, ch_fin_in_arc: 99 });
  });

  it("clamps at the very beginning", () => {
    expect(arcStep(arcs, 0, 0, -1)).toEqual({ arc_fin: 0, ch_fin_in_arc: 0 });
  });

  it("keeps counting past the last recorded arc", () => {
    expect(arcStep([{ ch_count: 100 }], 1, 40, 1)).toEqual({
      arc_fin: 1,
      ch_fin_in_arc: 41,
    });
  });
});
