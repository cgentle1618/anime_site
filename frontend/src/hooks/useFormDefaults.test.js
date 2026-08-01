import { describe, expect, it } from "vitest";
import {
  autofillFields,
  coerceToShape,
  resolveDefaults,
} from "./useFormDefaults";
import { defaultAnime, defaultMovie } from "../config/formFactories";
import { BUILTIN_AUTOFILL } from "../config/formFields";

describe("resolveDefaults", () => {
  it("returns the built-in factory values when nothing is configured", () => {
    expect(resolveDefaults("anime", {})).toEqual(defaultAnime());
    expect(resolveDefaults("anime", undefined)).toEqual(defaultAnime());
    expect(resolveDefaults("movie", { anime: { defaults: { x: 1 } } })).toEqual(
      defaultMovie(),
    );
  });

  it("applies configured overrides field by field", () => {
    const config = {
      anime: { defaults: { watching_status: "Plan to Watch", airing_type: "TV" } },
    };
    const resolved = resolveDefaults("anime", config);

    expect(resolved.watching_status).toBe("Plan to Watch");
    expect(resolved.airing_type).toBe("TV");
    // Everything not overridden stays at the built-in value.
    expect(resolved.is_main).toBe(defaultAnime().is_main);
    expect(resolved.airing_status).toBe(defaultAnime().airing_status);
  });

  it("drops stored keys that no longer exist on the form", () => {
    const resolved = resolveDefaults("anime", {
      anime: { defaults: { removed_field: "x", ep_total: "12" } },
    });

    expect(resolved).not.toHaveProperty("removed_field");
    expect(resolved.ep_total).toBe("12");
    expect(Object.keys(resolved)).toEqual(Object.keys(defaultAnime()));
  });

  it("coerces stored values to the form-state type", () => {
    const resolved = resolveDefaults("anime", {
      anime: { defaults: { ep_total: 12, is_main_entry: "yes", remark: null } },
    });

    expect(resolved.ep_total).toBe("12");
    expect(resolved.is_main_entry).toBe(true);
    expect(resolved.remark).toBe("");
  });

  it("never assigns a default to a foreign-key field", () => {
    const resolved = resolveDefaults("anime", {
      anime: { defaults: { franchise_id: "some-uuid" } },
    });
    expect(resolved.franchise_id).toBeNull();
  });

  it("returns {} for an unknown media type", () => {
    expect(resolveDefaults("not-a-type", {})).toEqual({});
  });
});

describe("coerceToShape", () => {
  it("matches the built-in value's type", () => {
    expect(coerceToShape(false, 1)).toBe(true);
    expect(coerceToShape("", 42)).toBe("42");
    expect(coerceToShape("", null)).toBe("");
    expect(coerceToShape(null, "x")).toBeNull();
    expect(coerceToShape([], "x")).toEqual([]);
    expect(coerceToShape([], ["a"])).toEqual(["a"]);
  });
});

describe("autofillFields", () => {
  it("falls back to the built-in field set when unconfigured", () => {
    expect(autofillFields("anime", {})).toEqual(BUILTIN_AUTOFILL.anime);
    expect(autofillFields("anime", { anime: { autofill: null } })).toEqual(
      BUILTIN_AUTOFILL.anime,
    );
  });

  it("honors a configured empty list as 'copy nothing'", () => {
    expect(autofillFields("anime", { anime: { autofill: [] } })).toEqual([]);
  });

  it("uses the configured list when present", () => {
    expect(
      autofillFields("anime", { anime: { autofill: ["studio"] } }),
    ).toEqual(["studio"]);
  });

  it("returns an empty list for an unknown media type", () => {
    expect(autofillFields("not-a-type", {})).toEqual([]);
  });
});
