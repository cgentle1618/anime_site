import { describe, it, expect, afterEach } from "vitest";
import { AIRING_STATUSES, applyConstants } from "./fieldOptions";

// applyConstants mutates AIRING_STATUSES (and the other bundled arrays) IN
// PLACE, so capture the true original contents once, before any test runs,
// and restore them after each test — otherwise later tests (and any other
// test file that happens to import fieldOptions.js in the same worker)
// would see whatever the last test here left behind.
const ORIGINAL_AIRING_STATUSES = [...AIRING_STATUSES];
afterEach(() => {
  applyConstants({ airing_status: ORIGINAL_AIRING_STATUSES });
});

// applyConstants is how /api/constants becomes the source of truth for
// every Add/Modify tab: it must overwrite the bundled arrays IN PLACE
// (never reassign the binding), since every tab imported a reference to
// the same array object. See config/useConstants.js.
describe("applyConstants", () => {
  it("mutates a bundled array's contents in place, not its binding", () => {
    const before = AIRING_STATUSES;
    applyConstants({ airing_status: ["Only From API"] });
    expect(AIRING_STATUSES).toBe(before); // same array reference
    expect(AIRING_STATUSES).toEqual(["Only From API"]);
  });

  it("leaves an array untouched when its key is absent from the payload", () => {
    const before = [...AIRING_STATUSES];
    applyConstants({ some_other_key: ["x"] });
    expect(AIRING_STATUSES).toEqual(before);
  });

  it("ignores a null/undefined payload", () => {
    const before = [...AIRING_STATUSES];
    applyConstants(null);
    applyConstants(undefined);
    expect(AIRING_STATUSES).toEqual(before);
  });
});
