// Frontend: unit tests for the three-way card status dispatcher.
/**
 * getCardStatusConfig() picks a button vocabulary from the media type. It is
 * the one place that knows watching, reading and playing are three separate
 * status axes rather than a read-or-watch binary.
 */

import { describe, expect, it } from "vitest";
import { getCardStatusConfig, getPlayingButtonConfig } from "./status";

describe("getCardStatusConfig", () => {
  it("is three-way, not read-or-watch", () => {
    expect(getCardStatusConfig("game", "Active Playing")).toEqual(
      getPlayingButtonConfig("Active Playing"),
    );
    // `target` is the status a click cycles to, and it is the field that
    // actually differs between the three vocabularies.
    expect(getCardStatusConfig("manga", "Active Reading").target).not.toBe(
      getPlayingButtonConfig("Active Playing").target,
    );
    expect(getCardStatusConfig("anime", "Active Watching").target).not.toBe(
      getPlayingButtonConfig("Active Playing").target,
    );
  });

  it("falls back to Might Play for an unknown playing status", () => {
    expect(getPlayingButtonConfig("nonsense")).toEqual(
      getPlayingButtonConfig("Might Play"),
    );
  });
});
