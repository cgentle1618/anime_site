import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAllSources } from "./sources";
import { PUBLISHER_SOURCES } from "../config/formFields/fieldMeta";

// Records every URL fetchAllSources asks for and answers each one with a
// payload derived from that URL, so a test can tell the per-scope publisher
// lists apart.
function stubFetch(payloadFor = () => []) {
  const calls = [];
  global.fetch = vi.fn((url) => {
    calls.push(String(url));
    return Promise.resolve({ ok: true, json: async () => payloadFor(String(url)) });
  });
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete global.fetch;
});

describe("fetchAllSources", () => {
  it("fetches publishers once per media type that credits one", async () => {
    const calls = stubFetch();

    await fetchAllSources();

    const publisherCalls = calls.filter((u) => u.includes("/api/publisher"));
    expect(publisherCalls).toHaveLength(PUBLISHER_SOURCES.length);
    expect(publisherCalls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("scope=anime"),
        expect.stringContaining("scope=game"),
      ]),
    );
  });

  it("never asks for the flat, unscoped publisher list", async () => {
    const calls = stubFetch();

    await fetchAllSources();

    expect(
      calls.filter((u) => u.includes("/api/publisher") && !u.includes("scope=")),
    ).toEqual([]);
  });

  it("returns the publishers keyed by media type", async () => {
    stubFetch((url) =>
      url.includes("/api/publisher")
        ? [{ display_name: new URL(url, "http://x").searchParams.get("scope") }]
        : [],
    );

    const { publishers } = await fetchAllSources();

    expect(publishers.anime).toEqual([{ display_name: "anime" }]);
    expect(publishers.game).toEqual([{ display_name: "game" }]);
  });
});

describe("PUBLISHER_SOURCES", () => {
  it("lists the distinct scopes the publisher fields ask for", () => {
    // Six, one per media type the publisher role is offered on -
    // legal_scopes("publisher") in app/utils/credit_roles.py. anime-movie is
    // in the list even though it never had a distributor field before the
    // migration: the role covers it, so the form offers it.
    expect([...PUBLISHER_SOURCES].sort()).toEqual([
      "anime",
      "anime-movie",
      "comic",
      "game",
      "manga",
      "novel",
    ]);
  });

  it("holds no unscoped entry — an unscoped fetch would return every publisher", () => {
    expect(PUBLISHER_SOURCES.filter((s) => !s)).toEqual([]);
  });
});
