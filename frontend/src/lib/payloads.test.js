import { describe, expect, it } from "vitest";

import {
  buildAnimePayload,
  buildCreditsPayload,
  creditsResponseToForm,
  gameFieldsPayload,
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

// The IGDB numeric id is Fill's only handle on a game, and the public
// www.igdb.com link the picker stores carries a slug rather than the id - so
// the id the admin picked has to travel in the payload of its own accord.
describe("game igdb_id", () => {
  it("is sent alongside the link", () => {
    const payload = gameFieldsPayload({
      igdb_id: "119133",
      igdb_link: "https://www.igdb.com/games/elden-ring",
    });
    expect(payload.igdb_id).toBe(119133);
    expect(payload.igdb_link).toBe("https://www.igdb.com/games/elden-ring");
  });

  it("is null when the form never got one", () => {
    expect(gameFieldsPayload({ igdb_id: "" }).igdb_id).toBeNull();
  });
});

// The Steam appid is typed in beside the store link, so a game IGDB has no
// external_games row for can still be identified by hand.
describe("game steam_appid", () => {
  it("is sent alongside the link", () => {
    const payload = gameFieldsPayload({
      steam_appid: "1245620",
      steam_link: "https://store.steampowered.com/app/1245620/",
    });
    expect(payload.steam_appid).toBe(1245620);
    expect(payload.steam_link).toBe(
      "https://store.steampowered.com/app/1245620/",
    );
  });

  it("is null when the form never got one", () => {
    expect(gameFieldsPayload({ steam_appid: "" }).steam_appid).toBeNull();
  });
});

// The three completion flags are tristate selects: "" is "unknown", not false.
describe("game completion flags", () => {
  it("sends all three as tristate booleans", () => {
    const payload = gameFieldsPayload({
      all_endings: "true",
      all_achievements: "false",
      all_collected: "",
    });
    expect(payload.all_endings).toBe(true);
    expect(payload.all_achievements).toBe(false);
    expect(payload.all_collected).toBeNull();
  });
});
