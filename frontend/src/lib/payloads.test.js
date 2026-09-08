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

// The publisher_tw / comic_publisher vocabularies are retired: every type's
// publisher field is now a `publisher` CREDIT resolving to a Publisher row,
// the way game's already was. A form still posting it as a tag writes to a
// vocabulary that no longer exists, which is a 422 on save.
describe("the publisher field posts a credit, not a tag", () => {
  it.each([
    ["anime", "distributor_tw"],
    // anime-movie shares anime's sheet header, distributor_tw, and got the
    // field for the first time in this migration.
    ["anime-movie", "distributor_tw"],
    ["manga", "publisher_tw"],
    ["novel", "publisher_tw"],
    ["comic", "publisher"],
  ])("sends %s's %s under the publisher role", (mediaType, field) => {
    const payload = buildCreditsPayload(mediaType, { [field]: "木棉花, 東立" });
    expect(payload.credits.publisher).toEqual(["木棉花", "東立"]);
    expect(payload.tags.publisher_tw).toBeUndefined();
    expect(payload.tags.comic_publisher).toBeUndefined();
  });

  it.each([
    ["anime", "distributor_tw"],
    ["anime-movie", "distributor_tw"],
    ["manga", "publisher_tw"],
    ["novel", "publisher_tw"],
    ["comic", "publisher"],
  ])("reads %s's %s back out of the credits half", (mediaType, field) => {
    const form = creditsResponseToForm(mediaType, {
      credits: { publisher: ["木棉花"] },
    });
    expect(form[field]).toBe("木棉花");
  });

  // Comic carried BOTH vocabularies; only one publisher field survives.
  it("leaves comic with no publisher_tw field at all", () => {
    const form = creditsResponseToForm("comic", { credits: {}, tags: {} });
    expect(form).not.toHaveProperty("publisher_tw");
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

// Not a completion flag: this one decides whether Steam may write playtime
// and achievements earned over what is already there.
describe("steam progress sync", () => {
  it("sends the lock as a tristate boolean", () => {
    expect(gameFieldsPayload({ steam_progress_sync: "false" }).steam_progress_sync).toBe(false);
    expect(gameFieldsPayload({ steam_progress_sync: "true" }).steam_progress_sync).toBe(true);
    expect(gameFieldsPayload({ steam_progress_sync: "" }).steam_progress_sync).toBeNull();
  });
});
