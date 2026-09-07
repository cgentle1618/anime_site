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

  it("renders an until-date when only the defunct date is on record", async () => {
    mockFetch({ studio: { ...STUDIO, founded_date: null, defunct_date: "2019" } });
    renderPage();
    expect(await screen.findByText("Until 2019")).toBeInTheDocument();
  });

  it("leaves Active blank rather than inventing a span when both dates are empty", async () => {
    mockFetch({
      studio: { ...STUDIO, founded_date: null, defunct_date: null },
    });
    renderPage();

    await screen.findByRole("heading", { name: "KyoAni" });
    // InfoRow keeps the row and shows an em dash for an absent value, so the
    // check is that no span text was fabricated - not that the row is gone.
    expect(screen.queryByText(/^Since /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Until /)).not.toBeInTheDocument();
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it("falls back through en/cn/jp/alt when no display field is chosen, without repeating the name", async () => {
    mockFetch({
      studio: {
        ...STUDIO,
        display_name_field: null,
        name_en: null,
        name_cn: "京都アニメーション中文",
        name_jp: "京都アニメーション",
        name_alt: "KyoAni",
        // The server resolves the fallback; the page renders what it sends.
        display_name: "京都アニメーション中文",
      },
    });
    renderPage();

    const heading = await screen.findByRole("heading", {
      name: "京都アニメーション中文",
    });
    expect(heading).toBeInTheDocument();

    const others = screen.getByLabelText("Other names");
    // Chinese is the displayed name, so it must not repeat as an other name.
    expect(within(others).queryByText("Chinese")).not.toBeInTheDocument();
    // Japanese and Alternative differ from it, so both are listed.
    expect(within(others).getByText("Japanese")).toBeInTheDocument();
    expect(within(others).getByText("Alternative")).toBeInTheDocument();
  });

  it("renders the website link, the MAL producer link and the remark", async () => {
    renderPage();

    expect(
      await screen.findByRole("link", { name: STUDIO.website_url }),
    ).toHaveAttribute("href", STUDIO.website_url);
    expect(
      screen.getByRole("link", { name: `Producer #${STUDIO.mal_id}` }),
    ).toHaveAttribute("href", STUDIO.mal_link);
    expect(screen.getByText(STUDIO.remark)).toBeInTheDocument();
  });
});
