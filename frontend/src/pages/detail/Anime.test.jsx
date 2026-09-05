// Anime detail page — cast section (Task 10): a read-only rendering of
// useCasting's rows, following Novel.test.jsx's setup (providers, mocking,
// router wrapping).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Anime from "./Anime";

const BASE_ANIME = {
  system_id: "a1",
  anime_name_cn: "測試動畫",
  anime_name_en: "Test Anime",
  anime_name_roman: null,
  franchise_id: null,
  series_id: null,
  airing_type: "TV",
  airing_status: "Finished",
  release_season: null,
  release_date: null,
  watching_status: "Watching",
  ep_fin: 1,
  ep_total: 12,
  my_rating: null,
  cover_image_file: null,
};

function respond(url, isAdmin) {
  const u = String(url);
  if (u.startsWith("/api/auth/me")) {
    return {
      is_admin: isAdmin,
      username: isAdmin ? "admin" : null,
      role: isAdmin ? "admin" : "guest",
      is_superuser: isAdmin,
      permissions: [],
    };
  }
  return [];
}

function mockFetch(anime, cast, { isAdmin = false } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/casting/anime/a1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ cast }),
        });
      }
      if (u.startsWith("/api/anime/a1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(anime),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(u, isAdmin)),
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/anime/a1"]}>
            <Routes>
              <Route path="/anime/:system_id" element={<Anime />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Anime detail page — cast", () => {
  it("renders the cast with links to the character and the seiyuu", async () => {
    mockFetch(BASE_ANIME, [
      {
        system_id: "cc1",
        character_id: "char-1",
        character_name: "Protagonist",
        person_id: "person-1",
        person_name: "Seiyuu One",
        role: "Main",
        position: 0,
        photo_file: "cc1.jpg",
        remark: null,
      },
    ]);
    mount();

    const characterLink = await screen.findByRole("link", { name: "Protagonist" });
    expect(characterLink).toHaveAttribute("href", "/character/char-1");

    const seiyuuLink = await screen.findByRole("link", { name: "Seiyuu One" });
    expect(seiyuuLink).toHaveAttribute("href", "/person/person-1");
  });

  // The server resolves photo_file (the casting's own photo, falling back to
  // the character's portrait) before it ever reaches the frontend — this
  // asserts the component renders whatever photo_file the server sent, not
  // that the frontend chose or computed a fallback itself.
  it("renders whatever photo_file the server already resolved, including a character-portrait fallback", async () => {
    mockFetch(BASE_ANIME, [
      {
        system_id: "cc1",
        character_id: "char-1",
        character_name: "Protagonist",
        person_id: null,
        person_name: null,
        role: "Main",
        position: 0,
        // No casting-specific photo was set — this is the server's resolved
        // fallback value (the character's own portrait file), not something
        // the frontend derives.
        photo_file: "character-portrait.jpg",
        remark: null,
      },
    ]);
    mount();

    // The cast photo is decorative (alt=""), so it carries no accessible
    // name testing-library's role queries can match — assert on the <img>
    // itself once the character it belongs to has rendered.
    await screen.findByRole("link", { name: "Protagonist" });
    const img = document.querySelector('img[src*="character-portrait.jpg"]');
    // getCoverUrl() on localhost resolves to /static/covers/<file>.
    expect(img).not.toBeNull();
  });

  it("renders no cast section when the entry has an empty cast", async () => {
    mockFetch(BASE_ANIME, []);
    mount();
    await screen.findByRole("heading", { name: "Test Anime" });
    expect(screen.queryByText("Cast")).not.toBeInTheDocument();
  });

  it("orders Main cast before Supporting cast", async () => {
    mockFetch(BASE_ANIME, [
      {
        system_id: "cc2",
        character_id: "char-2",
        character_name: "Sidekick",
        person_id: "person-2",
        person_name: "Seiyuu Two",
        role: "Supporting",
        position: 0,
        photo_file: null,
        remark: null,
      },
      {
        system_id: "cc1",
        character_id: "char-1",
        character_name: "Protagonist",
        person_id: "person-1",
        person_name: "Seiyuu One",
        role: "Main",
        position: 1,
        photo_file: null,
        remark: null,
      },
    ]);
    mount();

    const characterLinks = await screen.findAllByRole("link", {
      name: /Protagonist|Sidekick/,
    });
    expect(characterLinks.map((l) => l.textContent)).toEqual([
      "Protagonist",
      "Sidekick",
    ]);
  });
});
