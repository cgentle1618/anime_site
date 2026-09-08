// The novel form must be able to write serialization_platform: the field is a
// TAG_FIELD on manga and novel alike (app/utils/credit_roles.py) and the novel
// response already exposes it. Mirrors manga exactly.
import { describe, expect, it } from "vitest";

import { TYPE_FIELD_META } from "./fieldMeta";
import { defaultNovel } from "../formFactories";

describe("novel serialization_platform", () => {
  it("has a fieldMeta descriptor drawn from the novel-scoped vocabulary", () => {
    const meta = TYPE_FIELD_META.novel.serialization_platform;
    expect(meta).toBeTruthy();
    expect(meta.control).toBe("tags");
    expect(meta.source).toEqual({
      kind: "option",
      category: "Serialization Platform",
      scope: "novel",
    });
  });

  it("has a form default so the field is controlled from the first render", () => {
    expect(defaultNovel()).toHaveProperty("serialization_platform", "");
  });
});
