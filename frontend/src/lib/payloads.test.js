import { describe, expect, it } from "vitest";

import {
  buildAnimePayload,
  buildCreditsPayload,
  creditsResponseToForm,
} from "./payloads";

describe("source rows in the payload", () => {
  it("drops rows with a blank name", () => {
    const payload = buildAnimePayload({
      sources: [
        { kind: "access", bucket: "other", name: "  ", url: "x" },
        { kind: "access", bucket: "other", name: "Keep", url: "y" },
      ],
    });
    expect(payload.sources).toEqual([
      { kind: "access", bucket: "other", name: "Keep", url: "y", available: null },
    ]);
  });

  it("keeps two rows that share a name", () => {
    const payload = buildAnimePayload({
      sources: [
        { kind: "access", bucket: "other", name: "Same", url: "a" },
        { kind: "access", bucket: "other", name: "Same", url: "b" },
      ],
    });
    expect(payload.sources).toHaveLength(2);
  });
});

// serialization_platform is a TAG_FIELD on manga AND novel (app/utils/
// credit_roles.py) and the novel response already exposes it, so the novel
// form has to be able to write it too - otherwise the field is readable and
// unwritable.
describe("novel serialization_platform", () => {
  it("is sent to the credits endpoint as a tag", () => {
    const payload = buildCreditsPayload("novel", {
      serialization_platform: "Kakuyomu, Narou",
    });
    expect(payload.tags.serialization_platform).toEqual(["Kakuyomu", "Narou"]);
  });

  it("comes back out of a credits response", () => {
    const form = creditsResponseToForm("novel", {
      tags: { serialization_platform: ["Kakuyomu"] },
    });
    expect(form.serialization_platform).toBe("Kakuyomu");
  });
});
