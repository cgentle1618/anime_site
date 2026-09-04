// Frontend: unit tests for the status picker grouping helper.
/**
 * groupStatusOptions() is what turns the flat watching/reading vocabularies
 * into the <optgroup>s the Add, Modify and detail-page selects render. The
 * groups exist only to make a status easier to pick — nothing filters or
 * sorts by them (that is WATCHING_STATUS_GROUP's job).
 */

import { describe, it, expect } from "vitest";
import { groupStatusOptions } from "./statusGroups";
import { WATCHING_STATUSES, READING_STATUSES } from "./fieldOptions";

describe("groupStatusOptions", () => {
  it("splits the watching vocabulary into the three picker groups", () => {
    expect(groupStatusOptions(WATCHING_STATUSES)).toEqual([
      {
        label: "Not Released",
        statuses: ["Might Watch", "Plan to Watch", "Watch When Airs"],
      },
      {
        label: "On-Going",
        statuses: [
          "Active Watching",
          "Passive Watching",
          "Paused",
          "Temp Dropped",
        ],
      },
      {
        label: "Done",
        statuses: ["Completed", "Completed (解說)", "Dropped", "Won't Watch"],
      },
    ]);
  });

  it("splits the reading vocabulary, which has no 'Watch When Airs'", () => {
    expect(groupStatusOptions(READING_STATUSES)).toEqual([
      { label: "Not Released", statuses: ["Might Read", "Plan to Read"] },
      {
        label: "On-Going",
        statuses: [
          "Active Reading",
          "Passive Reading",
          "Paused",
          "Temp Dropped",
        ],
      },
      {
        label: "Done",
        statuses: ["Completed", "Completed (解說)", "Dropped", "Won't Read"],
      },
    ]);
  });

  it("drops groups with no members and keeps every value exactly once", () => {
    expect(groupStatusOptions(["Paused", "Dropped"])).toEqual([
      { label: "On-Going", statuses: ["Paused"] },
      { label: "Done", statuses: ["Dropped"] },
    ]);
  });

  it("keeps an unknown status - /api/constants may add one - in a trailing ungrouped bucket", () => {
    expect(groupStatusOptions(["Paused", "Rewatching"])).toEqual([
      { label: "On-Going", statuses: ["Paused"] },
      { label: null, statuses: ["Rewatching"] },
    ]);
  });

  it("returns nothing for an empty or missing list", () => {
    expect(groupStatusOptions([])).toEqual([]);
    expect(groupStatusOptions(undefined)).toEqual([]);
  });
});
