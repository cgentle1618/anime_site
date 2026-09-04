import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Studio from "./Studio";

const STUDIO = {
  system_id: "s1",
  name_en: "Kyoto Animation",
  name_cn: "京都動畫",
  name_jp: "京都アニメーション",
  name_alt: "KyoAni",
  display_name_field: "alt",
  display_name: "KyoAni",
  my_rating: "A",
  logo_file: null,
  remark: "The one with the pretty water.",
  founded_date: "1981-11-12",
  defunct_date: null,
  country: "Japan",
  website_url: "https://www.kyotoanimation.co.jp/",
  mal_id: 2,
  mal_link: "https://myanimelist.net/anime/producer/2",
  credit_count: 2,
};

const ENTRIES = {
  groups: [
    {
      media_type: "anime",
      label: "Anime",
      nav_path: "/anime",
      entries: [
        {
          system_id: "a1",
          display_name: "Violet Evergarden",
          cover_image_file: null,
          release_date: "2018-01-11",
        },
        {
          system_id: "a2",
          display_name: "Hyouka",
          cover_image_file: null,
          release_date: "2012-04-23",
        },
      ],
    },
  ],
};

function mockFetch({ studio = STUDIO, entries = ENTRIES, studioOk = true } = {}) {
  global.fetch = vi.fn((url) => {
    if (String(url).endsWith("/entries")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(entries) });
    }
    return Promise.resolve({
      ok: studioOk,
      status: studioOk ? 200 : 404,
      json: () => Promise.resolve(studio),
    });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/studio/s1"]}>
      <Routes>
        <Route path="/studio/:system_id" element={<Studio />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetch();
});

describe("Studio detail page", () => {
  it("heads the page with the display name and lists the other names", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "KyoAni" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Kyoto Animation")).toBeInTheDocument();
    expect(screen.getByText("京都アニメーション")).toBeInTheDocument();
    // The displayed name is not repeated in the alternative-names list.
    const others = screen.getByLabelText("Other names");
    expect(within(others).queryByText("KyoAni")).not.toBeInTheDocument();
  });

  it("shows the founding date without inventing a defunct one", async () => {
    renderPage();
    expect(await screen.findByText("Since 1981-11-12")).toBeInTheDocument();
  });

  it("closes the span when the studio is defunct", async () => {
    mockFetch({ studio: { ...STUDIO, defunct_date: "2019" } });
    renderPage();
    expect(await screen.findByText("1981-11-12 – 2019")).toBeInTheDocument();
  });

  it("links every credited entry to its own detail page", async () => {
    renderPage();
    expect(
      await screen.findByRole("link", { name: /Violet Evergarden/ }),
    ).toHaveAttribute("href", "/anime/a1");
    expect(screen.getByRole("link", { name: /Hyouka/ })).toHaveAttribute(
      "href",
      "/anime/a2",
    );
    expect(screen.getByText("Anime")).toBeInTheDocument();
  });

  it("says there are no credited entries rather than rendering an empty page", async () => {
    mockFetch({ entries: { groups: [] } });
    renderPage();
    expect(await screen.findByText(/No credited entries/i)).toBeInTheDocument();
  });

  it("renders the not-found state when the studio is missing", async () => {
    mockFetch({ studioOk: false, studio: { detail: "Studio not found." } });
    renderPage();
    expect(await screen.findByText(/Studio not found/i)).toBeInTheDocument();
  });
});
