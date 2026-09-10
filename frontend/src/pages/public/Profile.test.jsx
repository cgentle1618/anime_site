// Somebody's list, all media types on one page.
//
// The two things worth pinning: the page groups by media type rather than
// running nine tables down the screen, and a list the server would not show
// reads as "not found" rather than as an empty list - an empty list and a
// private one must not look the same.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Profile from "./Profile";

const BODY = {
  username: "kana",
  list_is_public: true,
  is_self: false,
  counts: [
    { status: "Completed", count: 1 },
    { status: "Reading", count: 1 },
  ],
  entries: [
    {
      media_id: "11111111-1111-1111-1111-111111111111",
      media_type: "anime",
      public_id: 412,
      display_name: "葬送的芙莉蓮",
      cover_image_file: null,
      status: "Completed",
      my_rating: "S",
    },
    {
      media_id: "22222222-2222-2222-2222-222222222222",
      media_type: "manga",
      public_id: 118,
      display_name: "鏈鋸人",
      cover_image_file: null,
      status: "Reading",
      my_rating: "B",
    },
  ],
};

function renderAt(username = "kana") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/user/${username}`]}>
        <Routes>
          <Route path="/user/:username" element={<Profile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Profile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("a public list", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, status: 200, json: async () => BODY })),
      );
    });

    it("names whose list it is", async () => {
      renderAt();
      expect(await screen.findByText("kana")).toBeInTheDocument();
    });

    it("shows every media type on one page", async () => {
      renderAt();
      expect(await screen.findByText("葬送的芙莉蓮")).toBeInTheDocument();
      expect(screen.getByText("鏈鋸人")).toBeInTheDocument();
    });

    it("groups the entries by media type", async () => {
      renderAt();
      const headings = (
        await screen.findAllByRole("heading", { level: 2 })
      ).map((h) => h.textContent);
      expect(headings).toEqual(["Anime", "Manga"]);
    });

    it("links each entry to its detail page", async () => {
      renderAt();
      const link = await screen.findByRole("link", { name: /葬送的芙莉蓮/ });
      // The slug is dropped for a CJK-only name - see lib/entityPath.js.
      expect(link.getAttribute("href")).toContain("/anime/412");
    });

    it("shows the status totals", async () => {
      renderAt();
      await screen.findByText("kana");
      // A bare /Completed/ matches twice - the total chip and the row's own
      // status - so the totals are matched by their "<status> <count>" shape.
      const totals = screen
        .getAllByText(/^(Completed|Reading)\s+\d+$/)
        .map((el) => el.textContent.replace(/\s+/g, " ").trim());
      expect(totals).toEqual(["Completed 1", "Reading 1"]);
    });
  });

  describe("a list the server will not show", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 404,
          json: async () => ({ detail: "Profile not found." }),
        })),
      );
    });

    it("says the profile is not available rather than showing an empty list", async () => {
      renderAt("nobody");
      expect(await screen.findByText(/no profile here/i)).toBeInTheDocument();
    });
  });
});
