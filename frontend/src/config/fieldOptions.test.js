import { describe, it, expect, afterEach } from "vitest";
import {
  AIRING_STATUSES,
  CONSTANTS_FALLBACK,
  MEDIA_TYPES,
  PERSON_ROLES,
  applyConstants,
} from "./fieldOptions";

// applyConstants mutates AIRING_STATUSES (and the other bundled arrays) IN
// PLACE, so capture the true original contents once, before any test runs,
// and restore them after each test — otherwise later tests (and any other
// test file that happens to import fieldOptions.js in the same worker)
// would see whatever the last test here left behind.
const ORIGINAL_AIRING_STATUSES = [...AIRING_STATUSES];
const ORIGINAL_PERSON_ROLES = [...PERSON_ROLES];
afterEach(() => {
  applyConstants({
    airing_status: ORIGINAL_AIRING_STATUSES,
    person_role: ORIGINAL_PERSON_ROLES,
  });
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

// PERSON_ROLES used to be a hand-written literal inside OptionsAddTab.jsx,
// with nothing enforcing the match against app/utils/credit_roles.py. It is
// served by GET /api/constants now, so it must be wired into applyConstants
// like every other Tier 1 enum — otherwise the bundle is silently the only
// source again and the whole change is cosmetic.
describe("admin-form vocabularies served from /api/constants", () => {
  it("exposes person_role and media_type to applyConstants", () => {
    expect(CONSTANTS_FALLBACK.person_role).toBe(PERSON_ROLES);
    expect(CONSTANTS_FALLBACK.media_type).toBe(MEDIA_TYPES);
  });

  it("updates PERSON_ROLES in place from the API payload", () => {
    const before = PERSON_ROLES;
    applyConstants({ person_role: ["director", "sound_director"] });
    expect(PERSON_ROLES).toBe(before);
    expect(PERSON_ROLES).toEqual(["director", "sound_director"]);
  });

  it("uses the hyphenated media type keys, not person-role scopes", () => {
    expect(MEDIA_TYPES).toContain("anime-movie");
    expect(MEDIA_TYPES).toContain("tv-show");
    expect(MEDIA_TYPES).not.toContain("non_anime");
  });
});
