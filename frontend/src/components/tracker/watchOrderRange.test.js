import { describe, expect, it } from "vitest";

import { supportsEpisodeRange } from "./WatchOrderGuide";

describe("supportsEpisodeRange", () => {
  it("allows a range for the episodic types", () => {
    expect(supportsEpisodeRange("anime")).toBe(true);
    expect(supportsEpisodeRange("tv-show")).toBe(true);
    expect(supportsEpisodeRange("cartoon")).toBe(true);
  });

  it("refuses a range for types that are watched or read as a whole", () => {
    expect(supportsEpisodeRange("movie")).toBe(false);
    expect(supportsEpisodeRange("anime-movie")).toBe(false);
    expect(supportsEpisodeRange("manga")).toBe(false);
    expect(supportsEpisodeRange("novel")).toBe(false);
  });

  // An item's media_type is nullable, and an unrecognised value should not
  // silently strip a control the admin may still need.
  it("allows a range for an unknown or missing media type", () => {
    expect(supportsEpisodeRange(null)).toBe(true);
    expect(supportsEpisodeRange(undefined)).toBe(true);
    expect(supportsEpisodeRange("audio-drama")).toBe(true);
  });
});
