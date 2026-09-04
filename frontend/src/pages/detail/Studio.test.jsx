import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Studio from "./Studio";

const STUDIO = {
  system_id: "1",
  name_en: "MAPPA",
  name_cn: "MAPPA中文",
  name_jp: null,
  name_alt: null,
  display_name_field: "en",
  display_name: "MAPPA",
  credit_count: 2,
  logo_file: "mappa.png",
  my_rating: "A",
  founded_date: "2011-06-14",
  defunct_date: null,
  country: "Japan",
  website_url: "https://mappa.co.jp",
  mal_id: 569,
  mal_link: "https://myanimelist.net/anime/producer/569",
  remark: "Known for action anime.",
};

const ENTRIES_WITH_GROUPS = {
  groups: [
    {
      media_type: "anime",
      label: "Anime",
      nav_path: "/anime",
      entries: [
        {
          system_id: "a1",
          display_name: "Jujutsu Kaisen",
          cover_image_file: "a1.jpg",
          release_date: "2020-10-03",
        },
      ],
    },
  ],
};

const ENTRIES_EMPTY = { groups: [] };

function mockFetch(studioResponse, entriesResponse) {
  global.fetch = vi.fn((url) => {
    if (String(url).includes("/entries")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(entriesResponse),
      });
    }
    if (studioResponse === null) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: "Studio not found." }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(studioResponse),
    });
  });
}

function renderPage(id = "1") {
  return render(
    <MemoryRouter initialEntries={[`/studio/${id}`]}>
      <Routes>
        <Route path="/studio/:system_id" element={<Studio />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Studio detail page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the display name and the other names without duplicating it", async () => {
    mockFetch(STUDIO, ENTRIES_EMPTY);
    renderPage();

    expect(await screen.findByRole("heading", { name: "MAPPA" })).toBeInTheDocument();
    // name_cn differs from the displayed name, so it should show once.
    expect(screen.getByText("MAPPA中文")).toBeInTheDocument();
    // The English name equals the displayed name (studio.display_name_field
    // is "en"), so it must not be listed again among the "other names".
    expect(screen.queryByText("Chinese:")).toBeInTheDocument();
    expect(screen.queryByText("English:")).not.toBeInTheDocument();
  });

  it("renders a group of credited entries and links them correctly", async () => {
    mockFetch(STUDIO, ENTRIES_WITH_GROUPS);
    renderPage();

    expect(await screen.findByText("Jujutsu Kaisen")).toBeInTheDocument();
    expect(screen.getByText("Anime")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Jujutsu Kaisen/ })).toHaveAttribute(
      "href",
      "/anime/a1",
    );
  });

  it("shows a plain empty message, not an error, for {\"groups\": []}", async () => {
    mockFetch(STUDIO, ENTRIES_EMPTY);
    renderPage();

    expect(await screen.findByText("No credited entries")).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("renders the not-found state on a 404", async () => {
    mockFetch(null, ENTRIES_EMPTY);
    renderPage("missing");

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  describe("the Active facts row", () => {
    it("renders founded and defunct as a range", async () => {
      mockFetch(
        { ...STUDIO, founded_date: "2011-06-14", defunct_date: "2020-01-01" },
        ENTRIES_EMPTY,
      );
      renderPage();

      expect(await screen.findByText("2011-06-14 – 2020-01-01")).toBeInTheDocument();
    });

    it("renders a since-date when only founded_date is set", async () => {
      mockFetch(
        { ...STUDIO, founded_date: "2011-06-14", defunct_date: null },
        ENTRIES_EMPTY,
      );
      renderPage();

      expect(await screen.findByText("Since 2011-06-14")).toBeInTheDocument();
    });

    it("renders an until-date when only defunct_date is set", async () => {
      mockFetch(
        { ...STUDIO, founded_date: null, defunct_date: "2020-01-01" },
        ENTRIES_EMPTY,
      );
      renderPage();

      expect(await screen.findByText("Until 2020-01-01")).toBeInTheDocument();
    });

    it("omits the row entirely when both dates are empty", async () => {
      mockFetch(
        { ...STUDIO, founded_date: null, defunct_date: null },
        ENTRIES_EMPTY,
      );
      renderPage();

      await screen.findByRole("heading", { name: "MAPPA" });
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
    });
  });

  it("resolves the display name via the en/cn/jp/alt fallback with a null display_name_field, and shows it exactly once", async () => {
    const studio = {
      ...STUDIO,
      display_name_field: null,
      name_en: null,
      name_cn: "京都アニメーション中文",
      name_jp: "京都アニメーション",
      name_alt: "KyoAni",
      display_name: "京都アニメーション中文",
    };
    mockFetch(studio, ENTRIES_EMPTY);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "京都アニメーション中文" }),
    ).toBeInTheDocument();
    // Chinese equals the displayed name and must not repeat as an "other name".
    expect(screen.queryByText("Chinese:")).not.toBeInTheDocument();
    // Japanese and Alternative differ, so both should be listed once.
    expect(screen.getByText("Japanese:")).toBeInTheDocument();
    expect(screen.getByText("Alternative:")).toBeInTheDocument();
    // The name also appears once more in the breadcrumb trail; scope the
    // "shows it exactly once" check to the header block itself.
    const heading = screen.getByRole("heading", { name: "京都アニメーション中文" });
    expect(within(heading.parentElement).getAllByText("京都アニメーション中文")).toHaveLength(1);
  });

  it("renders the website link, MAL link and remark", async () => {
    mockFetch(STUDIO, ENTRIES_EMPTY);
    renderPage();

    expect(
      await screen.findByRole("link", { name: STUDIO.website_url }),
    ).toHaveAttribute("href", STUDIO.website_url);
    expect(screen.getByRole("link", { name: "MyAnimeList" })).toHaveAttribute(
      "href",
      STUDIO.mal_link,
    );
    expect(screen.getByText(STUDIO.remark)).toBeInTheDocument();
  });
});
