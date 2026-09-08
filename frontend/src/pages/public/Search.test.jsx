// The search page's staff sections: people and studios are searchable and are
// stacked below every media section, because a name match ranks below a title
// match. Characters are not searchable at all.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Search, { SCOPE_LABELS } from "./Search";

const EMPTY_BUCKETS = {
  collection: [],
  franchise: [],
  series: [],
  anime: [],
  "anime-movie": [],
  movie: [],
  "tv-show": [],
  cartoon: [],
  manga: [],
  novel: [],
  comic: [],
  game: [],
  seasonal: [],
  person: [],
  studio: [],
  publisher: [],
};

const RESULTS = {
  query: "ghibli",
  scope: "all",
  related_franchises: [],
  results: {
    ...EMPTY_BUCKETS,
    anime: [
      {
        system_id: "a1",
        public_id: "a1",
        anime_name_en: "Ghibli Anime",
        airing_type: "TV",
        franchise_id: "f1",
      },
    ],
    person: [
      {
        system_id: "p1",
        public_id: "p1",
        name_jp: "宮崎駿",
        display_name: "宮崎駿",
        credit_count: 4,
      },
    ],
    game: [
      {
        system_id: "g1",
        public_id: "g1",
        game_name_cn: "魔女宅急便",
        game_name_en: "Ghibli Game",
        playing_status: "Might Play",
      },
    ],
    studio: [
      {
        system_id: "s1",
        public_id: "s1",
        name_en: "Studio Ghibli",
        display_name: "Studio Ghibli",
        credit_count: 12,
      },
    ],
    publisher: [
      {
        system_id: "pb1",
        public_id: "pb1",
        name_en: "Ghibli Publishing",
        display_name: "Ghibli Publishing",
        credit_count: 3,
      },
    ],
  },
};

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            String(url).startsWith("/api/search/")
              ? RESULTS
              : { is_admin: false, username: null, role: "guest", is_superuser: false, permissions: [] },
          ),
      }),
    ),
  );
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/search?q=ghibli"]}>
            <Search />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Search page — staff results", () => {
  it("shows matching people and studios", async () => {
    renderPage();
    expect(await screen.findByText("Studio Ghibli")).toBeInTheDocument();
    expect(screen.getByText("宮崎駿")).toBeInTheDocument();
    expect(screen.getByText("12 credits")).toBeInTheDocument();
  });

  it("links a person and a studio to their detail pages", async () => {
    renderPage();
    expect(
      (await screen.findByText("宮崎駿")).closest("a"),
    ).toHaveAttribute("href", "/person/p1");
    expect(screen.getByText("Studio Ghibli").closest("a")).toHaveAttribute(
      "href",
      "/studio/s1/studio-ghibli",
    );
  });

  it("stacks the staff sections below the media sections", async () => {
    renderPage();
    await screen.findByText("Studio Ghibli");
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Anime",
      "Game",
      "People",
      "Studios",
      "Publishers",
    ]);
  });

  it("counts people and studios in the result summary", async () => {
    renderPage();
    await screen.findByText("Studio Ghibli");
    // The counts are split across nested spans, so read the rendered text.
    expect(document.body.textContent).toContain("1 people");
    expect(document.body.textContent).toContain("1 studios");
  });
});

describe("Search page — scopes", () => {
  it("offers game as a search scope", () => {
    expect(SCOPE_LABELS.game).toBe("Game");
  });

  it("offers publisher as a search scope, matching the API bucket", () => {
    expect(SCOPE_LABELS.publisher).toBe("Publisher");
  });

  it("shows matching publishers, linked to their detail page", async () => {
    renderPage();
    const link = (await screen.findByText("Ghibli Publishing")).closest("a");
    expect(link).toHaveAttribute("href", "/publisher/pb1/ghibli-publishing");
  });
});
