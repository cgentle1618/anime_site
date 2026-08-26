import { describe, expect, it } from "vitest";

import { fitMiddle } from "./textFit";

// A stand-in for canvas measurement: 12px per CJK character, 6px per Latin one
// - the ratio that makes a character budget wrong in the first place.
const measure = (token) =>
  [...token].reduce(
    (w, ch) => w + (/[⺀-鿿豈-﫿　-〿＀-￯]/.test(ch) ? 12 : 6),
    0,
  );

describe("fitMiddle", () => {
  it("leaves a name that already fits alone", () => {
    expect(fitMiddle("Steins;Gate", measure, 140)).toBe("Steins;Gate");
  });

  it("keeps the tail of a long CJK name", () => {
    const name = "無職轉生，到了異世界就拿出真本事 第三季 上半";
    const fitted = fitMiddle(name, measure, 100);

    expect(fitted).not.toBe(name);
    expect(fitted).toContain("…");
    expect(fitted.startsWith("無職轉生")).toBe(true);
    expect(fitted.endsWith("上半")).toBe(true);
  });

  it("fits what it returns into the two lines it was given", () => {
    const name = "無職轉生，到了異世界就拿出真本事 第三季 上半";
    const fitted = fitMiddle(name, measure, 100);

    // Every character can start a line here, so the width is the whole test.
    expect(measure(fitted)).toBeLessThanOrEqual(200);
  });

  it("trims a long Latin name from the middle too", () => {
    const name =
      "That Time I Got Reincarnated as a Slime the Movie: Scarlet Bond";
    const fitted = fitMiddle(name, measure, 100);

    expect(fitted).toContain("…");
    expect(fitted.endsWith("Bond")).toBe(true);
  });

  it("returns the name untouched when there is nothing to measure with", () => {
    const name = "無職轉生，到了異世界就拿出真本事 第三季 上半";

    expect(fitMiddle(name, null, 140)).toBe(name);
    expect(fitMiddle(name, measure, 0)).toBe(name);
  });
});
