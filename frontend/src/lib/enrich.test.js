import { enrichEntry } from "./enrich";

function response(ok, body) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

afterEach(() => vi.unstubAllGlobals());

it("returns the re-read entry when Replace succeeds", async () => {
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => response(true, { status: "success" }))
    .mockImplementationOnce(() => response(true, { system_id: "a1", mal_rating: "8.7" }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(enrichEntry("anime", "a1")).resolves.toEqual({ system_id: "a1", mal_rating: "8.7" });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/data-control/replace/anime/a1");
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/anime/a1");
});

it("returns null when Replace fails, so the caller keeps the saved row and warns", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response(false, { detail: "TMDB down" })));
  await expect(enrichEntry("movie", "m1")).resolves.toBeNull();
});

it("returns null when the network throws", async () => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
  await expect(enrichEntry("manga", "g1")).resolves.toBeNull();
});
