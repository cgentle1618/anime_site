// The read-only external-API coverage page.
//
// What matters here is the distinction the page exists to draw: a fill-only
// field and an overwritten one must not look the same. The rest is layout.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExternalApis from "./ExternalApis";

const PAYLOAD = {
  services: [
    {
      key: "tenrai",
      label: "Tenrai (MyAnimeList)",
      base_url: "https://api.tenrai.org/v1",
      auth: "None - public read-only mirror",
      rate_limit: "4 / second",
      docs_anchor: "tenrai-myanimelist",
      feeds: ["anime"],
    },
    {
      key: "omdb",
      label: "OMDb",
      base_url: "http://www.omdbapi.com",
      auth: "OMDB_API_KEY",
      rate_limit: "1000 / day",
      docs_anchor: "omdb",
      feeds: ["movie"],
    },
  ],
  rules: [
    { key: "fill-only", description: "Written only when the column is empty." },
    { key: "overwrite", description: "Rewritten on every run." },
  ],
  targets: [{ key: "column", description: "a column" }],
  combinations: [{ key: "single", description: "One source." }],
  key_missing_behaviour: "A missing key is never fatal.",
  media: [
    {
      key: "anime",
      label: "Anime",
      keyed_by: "mal_id",
      combination: "single",
      requests_per_entry: "1",
      note: "",
      in_fill_all: true,
      has_bulk_replace: true,
      fill_only: false,
      budget_limited: false,
      sources: [
        {
          source: "tenrai",
          label: "Tenrai (MyAnimeList)",
          writes: [
            { field: "release_date", target: "column", rule: "fill-only", note: "" },
            { field: "mal_rating", target: "column", rule: "overwrite", note: "" },
          ],
        },
      ],
    },
    {
      key: "comic",
      label: "Comic",
      keyed_by: "comicvine_id",
      combination: "single",
      requests_per_entry: "1",
      note: "Runs on its own.",
      in_fill_all: false,
      has_bulk_replace: false,
      fill_only: false,
      budget_limited: true,
      sources: [
        {
          source: "comicvine",
          label: "Comic Vine",
          writes: [
            { field: "issue_total", target: "column", rule: "fill-only", note: "" },
          ],
        },
      ],
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ExternalApis />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(PAYLOAD) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExternalApis", () => {
  it("renders a section per media type", async () => {
    renderPage();
    // Exact names: the source sub-headings are "Tenrai (MyAnimeList)" and
    // "Comic Vine", both of which a loose /anime/i or /comic/i would catch.
    expect(await screen.findByRole("heading", { name: "Anime" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comic" })).toBeInTheDocument();
  });

  it("marks the overwritten field differently from the fill-only one", async () => {
    renderPage();
    const overwritten = await screen.findByTestId("write-anime-mal_rating");
    const filled = screen.getByTestId("write-anime-release_date");
    expect(within(overwritten).getByText(/overwrite/i)).toBeInTheDocument();
    expect(within(filled).getByText(/fill-only/i)).toBeInTheDocument();
  });

  it("says which entries a Replace run would rewrite", async () => {
    renderPage();
    // The page's whole point: the overwrite list, called out up front.
    const summary = await screen.findByTestId("overwrite-summary");
    expect(within(summary).getByText(/mal_rating/)).toBeInTheDocument();
  });

  it("shows the pipeline flags a media type actually has", async () => {
    renderPage();
    const anime = await screen.findByTestId("media-anime");
    expect(within(anime).getByText(/fill all/i)).toBeInTheDocument();
    expect(within(anime).getByText(/bulk replace/i)).toBeInTheDocument();

    const comic = screen.getByTestId("media-comic");
    expect(within(comic).getByText(/no bulk replace/i)).toBeInTheDocument();
    expect(within(comic).getByText(/quota/i)).toBeInTheDocument();
  });

  it("lists each service with the env var behind it", async () => {
    renderPage();
    const services = await screen.findByTestId("service-table");
    expect(within(services).getByText(/OMDB_API_KEY/)).toBeInTheDocument();
  });

  it("survives a failed request without crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("external-apis-empty")).toBeInTheDocument(),
    );
  });
});
