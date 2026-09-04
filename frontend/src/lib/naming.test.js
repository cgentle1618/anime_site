import { describe, expect, it } from "vitest";
import { displayPersonName, displayStudioName } from "./naming";

describe("displayStudioName", () => {
  it("honours the chosen field", () => {
    expect(
      displayStudioName({
        name_en: "Kyoto Animation",
        name_alt: "KyoAni",
        display_name_field: "alt",
      }),
    ).toBe("KyoAni");
  });

  it("falls back when the chosen field is empty", () => {
    expect(
      displayStudioName({ name_en: "Kyoto Animation", display_name_field: "alt" }),
    ).toBe("Kyoto Animation");
  });

  it("falls back en -> cn -> jp -> alt when unchosen", () => {
    expect(displayStudioName({ name_cn: "京都動畫", name_jp: "京アニ" })).toBe("京都動畫");
    expect(displayStudioName({ name_jp: "京アニ" })).toBe("京アニ");
    expect(displayStudioName({ name_alt: "KyoAni" })).toBe("KyoAni");
  });

  it("returns an empty string for a studio with no names", () => {
    expect(displayStudioName({})).toBe("");
    expect(displayStudioName(null)).toBe("");
  });
});

describe("displayPersonName", () => {
  it("honours display_name_field", () => {
    expect(
      displayPersonName({
        name_en: "Ryan Coogler",
        name_cn: "瑞恩·庫格勒",
        display_name_field: "cn",
      }),
    ).toBe("瑞恩·庫格勒");
  });

  it("falls back when the chosen field is empty", () => {
    expect(
      displayPersonName({ name_jp: "諫山創", display_name_field: "cn" }),
    ).toBe("諫山創");
  });

  it("falls back en -> cn -> jp -> alt when unset", () => {
    expect(displayPersonName({ name_cn: "渡部高志", name_jp: "x" })).toBe(
      "渡部高志",
    );
    expect(displayPersonName({ name_alt: "only" })).toBe("only");
  });

  it("returns an empty string for a nameless person", () => {
    expect(displayPersonName({})).toBe("");
    expect(displayPersonName(null)).toBe("");
  });
});
