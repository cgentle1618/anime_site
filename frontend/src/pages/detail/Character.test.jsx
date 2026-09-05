import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Character from "./Character";

const CHARACTER = {
  system_id: "c1",
  name_en: "Yuki Nagato",
  name_cn: null,
  name_jp: "長門有希",
  name_alt: null,
  display_name_field: "en",
  display_name: "Yuki Nagato",
  gender: "Female",
  my_rating: null,
  photo_file: null,
  remark: null,
  casting_count: 2,
};

const ENTRIES = {
  groups: [
    {
      media_type: "anime",
      nav_path: "/anime",
      entries: [
        {
          system_id: "a1",
          display_name: "Haruhi Suzumiya",
          cover_image_file: null,
          release_date: "2006-04-02",
          seiyuu_display_name: "Minori Chihara",
          seiyuu_system_id: "p1",
        },
      ],
    },
    {
      media_type: "manga",
      nav_path: "/manga",
      entries: [],
    },
  ],
};

function mockFetch({ character = CHARACTER, entries = ENTRIES, characterOk = true } = {}) {
  global.fetch = vi.fn((url) => {
    if (String(url).endsWith("/entries")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(entries) });
    }
    return Promise.resolve({
      ok: characterOk,
      status: characterOk ? 200 : 404,
      json: () => Promise.resolve(character),
    });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/character/c1"]}>
      <Routes>
        <Route path="/character/:system_id" element={<Character />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockFetch();
});

describe("Character detail page", () => {
  it("heads the page with the display name", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Yuki Nagato" }),
    ).toBeInTheDocument();
  });

  it("groups entries by media type and names the seiyuu in each", async () => {
    renderPage();
    expect(
      await screen.findByRole("link", { name: /Haruhi Suzumiya/ }),
    ).toHaveAttribute("href", "/anime/a1");
    expect(screen.getByText("Anime")).toBeInTheDocument();
    // The seiyuu link is a genuine assertion on href, not just visible text.
    expect(screen.getByRole("link", { name: "Minori Chihara" })).toHaveAttribute(
      "href",
      "/person/p1",
    );
  });

  it("renders an empty group rather than hiding it when every entry is hidden", async () => {
    renderPage();
    // The manga group has zero visible entries, but the group heading and its
    // placeholder text must still render - it is not omitted.
    expect(await screen.findByText("Manga")).toBeInTheDocument();
    expect(
      screen.getByText("Nothing you can see here."),
    ).toBeInTheDocument();
  });

  it("says there are no appearances rather than rendering an empty page", async () => {
    mockFetch({ entries: { groups: [] } });
    renderPage();
    expect(await screen.findByText(/No appearances/i)).toBeInTheDocument();
  });

  it("renders the not-found state when the character is missing", async () => {
    mockFetch({ characterOk: false, character: { detail: "Character not found." } });
    renderPage();
    expect(await screen.findByText(/Character not found/i)).toBeInTheDocument();
  });
});
