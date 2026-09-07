import { describe, expect, it } from "vitest";
import { entityPath, entitySlug, slugify } from "./entityPath";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Fullmetal Alchemist: Brotherhood")).toBe(
      "fullmetal-alchemist-brotherhood",
    );
  });

  it("folds accents to ASCII", () => {
    expect(slugify("Pokémon Café")).toBe("pokemon-cafe");
  });

  it("collapses runs of punctuation and trims the edges", () => {
    expect(slugify("  --K-On!!  ")).toBe("k-on");
  });

  it("returns empty for text with no Latin characters", () => {
    expect(slugify("钢之炼金术师")).toBe("");
  });

  it("truncates long titles at a hyphen boundary", () => {
    const long = "the melancholy of haruhi suzumiya the disappearance edition";
    const out = slugify(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("-")).toBe(false);
    expect(long.replace(/ /g, "-").startsWith(out)).toBe(true);
  });

  it("survives null and undefined", () => {
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
  });
});

describe("entitySlug", () => {
  it("prefers the English name over the Chinese one", () => {
    const anime = {
      anime_name_cn: "钢之炼金术师",
      anime_name_en: "Fullmetal Alchemist",
    };
    expect(entitySlug("anime", anime)).toBe("fullmetal-alchemist");
  });

  it("falls back to roman, then alt", () => {
    expect(entitySlug("anime", { anime_name_roman: "Hagane no Renkinjutsushi" })).toBe(
      "hagane-no-renkinjutsushi",
    );
    expect(entitySlug("anime", { anime_name_alt: "FMA" })).toBe("fma");
  });

  it("is empty when only a Chinese name exists", () => {
    expect(entitySlug("anime", { anime_name_cn: "钢之炼金术师" })).toBe("");
  });

  it("knows the irregular prefixes", () => {
    expect(entitySlug("anime-movie", { anime_movie_name_en: "Your Name" })).toBe("your-name");
    expect(entitySlug("tv-show", { tv_name_en: "Breaking Bad" })).toBe("breaking-bad");
  });

  it("uses the bare name columns for entity types", () => {
    expect(entitySlug("person", { name_en: "Hiroshi Kamiya" })).toBe("hiroshi-kamiya");
    expect(entitySlug("studio", { name_en: "Studio Bones" })).toBe("studio-bones");
  });

  it("uses list_name for a watch order", () => {
    expect(entitySlug("watch-order", { list_name: "Release Order" })).toBe("release-order");
  });
});

describe("entityPath", () => {
  it("builds id and slug", () => {
    const anime = { public_id: 47, anime_name_en: "Fullmetal Alchemist" };
    expect(entityPath("anime", anime)).toBe("/anime/47/fullmetal-alchemist");
  });

  it("omits the slug when there is no Latin name", () => {
    expect(entityPath("anime", { public_id: 93, anime_name_cn: "钢之炼金术师" })).toBe(
      "/anime/93",
    );
  });

  it("returns empty when the entity has no public_id, so callers can skip the link", () => {
    expect(entityPath("anime", { anime_name_en: "Nameless" })).toBe("");
    expect(entityPath("anime", null)).toBe("");
  });
});
