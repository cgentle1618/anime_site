// Frontend: the Add form's starting values, per media type.
//
// A factory is the contract between /defaults, the Add page and the payload
// builder: a field missing here is a field the Add form cannot show and the
// defaults page cannot configure.
import { describe, expect, it } from "vitest";
import { FORM_FACTORIES, defaultGame } from "./formFactories";

describe("defaultGame", () => {
  it("starts on Might Play with the play flags off", () => {
    const form = defaultGame();
    expect(form.playing_status).toBe("Might Play");
    expect(form.play_next).toBe(false);
    expect(form.to_replay).toBe(false);
    expect(form.copies).toEqual([]);
  });

  it("is registered under the game key", () => {
    expect(FORM_FACTORIES.game).toBe(defaultGame);
  });
});
