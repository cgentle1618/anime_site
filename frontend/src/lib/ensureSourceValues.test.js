import { describe, it, expect, vi } from "vitest";
import {
  computeMissingSourceValues,
  buildCreateRequest,
  ensureSourceValues,
} from "./ensureSourceValues";

const sources = {
  options: [{ category: "Genre Main", value: "Action", scopes: [] }],
  studios: [{ name_native: "A-1 Pictures" }],
  people: {
    "director|anime": [{ name_native: "Abel Gongora" }],
  },
};

describe("computeMissingSourceValues", () => {
  it("excludes values already present for that source", () => {
    const result = computeMissingSourceValues(
      [
        {
          source: { kind: "option", category: "Genre Main" },
          values: ["Action", "Drama"],
        },
      ],
      sources,
    );
    expect(result).toEqual([
      { source: { kind: "option", category: "Genre Main" }, value: "Drama" },
    ]);
  });

  it("excludes an existing person for that role/scope", () => {
    const result = computeMissingSourceValues(
      [
        {
          source: { kind: "person", role: "director", scope: "anime" },
          values: ["Abel Gongora", "New Director"],
        },
      ],
      sources,
    );
    expect(result).toEqual([
      {
        source: { kind: "person", role: "director", scope: "anime" },
        value: "New Director",
      },
    ]);
  });

  it("ignores empty/falsy typed values", () => {
    const result = computeMissingSourceValues(
      [{ source: { kind: "studio" }, values: ["", null, undefined] }],
      sources,
    );
    expect(result).toEqual([]);
  });

  it("returns an empty list when nothing is missing", () => {
    expect(computeMissingSourceValues([], sources)).toEqual([]);
  });
});

describe("buildCreateRequest", () => {
  it("posts a studio as { name_en }", () => {
    const [url, init] = buildCreateRequest({ kind: "studio" }, "New Studio");
    expect(url).toBe("/api/studio/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name_en: "New Studio" });
  });

  it("posts a person with the requested role AND scope", () => {
    const [url, init] = buildCreateRequest(
      { kind: "person", role: "director", scope: "anime" },
      "New Director",
    );
    expect(url).toBe("/api/person/");
    expect(JSON.parse(init.body)).toEqual({
      name_native: "New Director",
      roles: [{ role: "director", scope: "anime" }],
    });
  });

  it("carries a non-anime scope through unchanged", () => {
    const [, init] = buildCreateRequest(
      { kind: "person", role: "illustrator", scope: "comic" },
      "New Artist",
    );
    expect(JSON.parse(init.body).roles).toEqual([
      { role: "illustrator", scope: "comic" },
    ]);
  });

  it("does not invent a null scope for a descriptor that lacks one", () => {
    // Replaces "posts a scopeless person role with scope: null". Every
    // descriptor carries a scope now and the API rejects a role without a
    // legal one, so sending scope: null would guarantee a 422 rather than
    // meaning "offered everywhere". A malformed descriptor should surface as
    // a failed create, not be quietly padded into an invalid request.
    const [, init] = buildCreateRequest(
      { kind: "person", role: "composer" },
      "New Composer",
    );
    expect(JSON.parse(init.body).roles[0]).not.toHaveProperty("scope", null);
  });

  it("posts an option with its category and scope array", () => {
    const [url, init] = buildCreateRequest(
      { kind: "option", category: "Genre Main", scope: "anime" },
      "Isekai",
    );
    expect(url).toBe("/api/options/");
    expect(JSON.parse(init.body)).toEqual({
      category: "Genre Main",
      value: "Isekai",
      scopes: ["anime"],
    });
  });

  it("posts an unscoped option with an empty scopes array", () => {
    const [, init] = buildCreateRequest(
      { kind: "option", category: "Genre Main" },
      "Isekai",
    );
    expect(JSON.parse(init.body).scopes).toEqual([]);
  });
});

describe("ensureSourceValues", () => {
  it("dispatches each missing value to the fetch call matching its kind", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await ensureSourceValues(
      [
        {
          source: { kind: "person", role: "director", scope: "anime" },
          values: ["Abel Gongora", "New Director"],
        },
        { source: { kind: "studio" }, values: ["New Studio"] },
        {
          source: { kind: "option", category: "Genre Main" },
          values: ["Action", "Isekai"],
        },
      ],
      sources,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const [personUrl, personInit] = fetchImpl.mock.calls.find(([url]) =>
      url.startsWith("/api/person"),
    );
    expect(personUrl).toBe("/api/person/");
    expect(JSON.parse(personInit.body)).toEqual({
      name_native: "New Director",
      roles: [{ role: "director", scope: "anime" }],
    });

    const [studioUrl, studioInit] = fetchImpl.mock.calls.find(([url]) =>
      url.startsWith("/api/studio"),
    );
    expect(studioUrl).toBe("/api/studio/");
    expect(JSON.parse(studioInit.body)).toEqual({ name_en: "New Studio" });

    const [optionUrl, optionInit] = fetchImpl.mock.calls.find(([url]) =>
      url.startsWith("/api/options"),
    );
    expect(optionUrl).toBe("/api/options/");
    expect(JSON.parse(optionInit.body)).toEqual({
      category: "Genre Main",
      value: "Isekai",
      scopes: [],
    });
  });

  it("makes no requests when everything already exists", async () => {
    const fetchImpl = vi.fn();
    await ensureSourceValues(
      [
        {
          source: { kind: "person", role: "director", scope: "anime" },
          values: ["Abel Gongora"],
        },
      ],
      sources,
      fetchImpl,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
