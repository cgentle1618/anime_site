// Frontend: unit tests for the login page's saved-username list.
/**
 * The list is a quick-swap convenience, not a credential store: it holds
 * usernames only, in this browser only, capped at three. The cap does not
 * evict - a fourth sign-in is simply not remembered - so nothing you
 * deliberately kept disappears without you removing it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAVED_USERS_KEY,
  MAX_SAVED_USERS,
  forgetUser,
  readSavedUsers,
  rememberUser,
} from "./savedUsers";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function store(value) {
  localStorage.setItem(SAVED_USERS_KEY, JSON.stringify(value));
}

describe("readSavedUsers", () => {
  it("reads back what was stored", () => {
    store(["admin", "cgent"]);
    expect(readSavedUsers()).toEqual(["admin", "cgent"]);
  });

  it("is empty when nothing is stored", () => {
    expect(readSavedUsers()).toEqual([]);
  });

  it("survives a corrupt value", () => {
    localStorage.setItem(SAVED_USERS_KEY, "{not json");
    expect(readSavedUsers()).toEqual([]);
  });

  it("survives a value of the wrong shape", () => {
    store({ admin: true });
    expect(readSavedUsers()).toEqual([]);
  });

  it("drops entries that are not usable usernames", () => {
    store(["admin", "", "   ", 7, null, "cgent"]);
    expect(readSavedUsers()).toEqual(["admin", "cgent"]);
  });

  it("drops duplicates, keeping the first", () => {
    store(["admin", "cgent", "admin"]);
    expect(readSavedUsers()).toEqual(["admin", "cgent"]);
  });

  it("never returns more than the cap, however many were stored", () => {
    store(["a", "b", "c", "d", "e"]);
    expect(readSavedUsers()).toHaveLength(MAX_SAVED_USERS);
    expect(readSavedUsers()).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
    });
    expect(readSavedUsers()).toEqual([]);
  });
});

describe("rememberUser", () => {
  it("adds a username to an empty list", () => {
    expect(rememberUser("admin")).toEqual(["admin"]);
    expect(readSavedUsers()).toEqual(["admin"]);
  });

  it("adds to the front, most recent first", () => {
    rememberUser("admin");
    rememberUser("cgent");
    expect(readSavedUsers()).toEqual(["cgent", "admin"]);
  });

  it("moves an already-saved username to the front instead of duplicating it", () => {
    store(["admin", "cgent", "guest"]);
    expect(rememberUser("guest")).toEqual(["guest", "admin", "cgent"]);
  });

  it("does not save a fourth username - the full list stays as it is", () => {
    store(["admin", "cgent", "guest"]);
    expect(rememberUser("someone-new")).toEqual(["admin", "cgent", "guest"]);
    expect(readSavedUsers()).toEqual(["admin", "cgent", "guest"]);
  });

  it("still reorders a saved username when the list is full", () => {
    store(["admin", "cgent", "guest"]);
    expect(rememberUser("guest")).toEqual(["guest", "admin", "cgent"]);
  });

  it("trims surrounding whitespace", () => {
    rememberUser("  admin  ");
    expect(readSavedUsers()).toEqual(["admin"]);
  });

  it("ignores an empty or non-string username", () => {
    expect(rememberUser("   ")).toEqual([]);
    expect(rememberUser(null)).toEqual([]);
    expect(readSavedUsers()).toEqual([]);
  });

  it("is case-sensitive, because the backend is", () => {
    store(["admin"]);
    expect(rememberUser("Admin")).toEqual(["Admin", "admin"]);
  });

  it("does not throw when storage refuses to write", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(["admin"]),
      setItem() {
        throw new Error("quota");
      },
    });
    expect(() => rememberUser("cgent")).not.toThrow();
    expect(rememberUser("cgent")).toEqual(["cgent", "admin"]);
  });
});

describe("forgetUser", () => {
  it("removes the named username and leaves the rest in order", () => {
    store(["admin", "cgent", "guest"]);
    expect(forgetUser("cgent")).toEqual(["admin", "guest"]);
    expect(readSavedUsers()).toEqual(["admin", "guest"]);
  });

  it("makes room for a new username again", () => {
    store(["admin", "cgent", "guest"]);
    forgetUser("guest");
    expect(rememberUser("someone-new")).toEqual(["someone-new", "admin", "cgent"]);
  });

  it("is a no-op for a username that is not saved", () => {
    store(["admin"]);
    expect(forgetUser("nobody")).toEqual(["admin"]);
  });
});
