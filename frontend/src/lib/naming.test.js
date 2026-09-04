import { describe, expect, it } from "vitest";
import { displayStudioName } from "./naming";

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
