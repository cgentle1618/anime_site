// Frontend: how a game's fields bucket into groups.
//
// The Add/Modify form draws a Rating section of its own under Classification,
// so the registry has to agree — /defaults reads these groups, and a my_rating
// left in the shared "Status" group would split the three verdict fields
// across two pages that are meant to match.
import { describe, expect, it } from "vitest";
import { getFieldGroups, getFieldMap } from "./index";

describe("game field groups", () => {
  it("puts my rating and both Metacritic scores in Ratings", () => {
    const map = getFieldMap("game");
    expect(map.my_rating.group).toBe("Ratings");
    expect(map.metacritic_score.group).toBe("Ratings");
    expect(map.metacritic_user_score.group).toBe("Ratings");
  });

  it("orders Ratings after Classification, as the form does", () => {
    const groups = getFieldGroups("game").map((g) => g.group);
    expect(groups.indexOf("Ratings")).toBeGreaterThan(
      groups.indexOf("Classification"),
    );
  });
});
