// /library/:type renders the matching config; an unknown type is not a crash.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Library from "./Library";
import { LIBRARY_CONFIGS } from "./configs";

function respond(url) {
  if (url.startsWith("/api/auth/me")) {
    return { is_admin: false, username: null, role: "guest", is_superuser: false, permissions: [] };
  }
  if (url.startsWith("/api/anime/")) return [{ system_id: "a1", anime_name_en: "Frieren", franchise_id: "f1" }];
  if (url.startsWith("/api/franchise/")) return [{ system_id: "f1", franchise_name_en: "Frieren Franchise" }];
  return [];
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url))) }))
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/library/:type" element={<Library />} />
              <Route path="/under-development" element={<div>Not here yet</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

it("has a config for every media type that has a library", () => {
  expect(Object.keys(LIBRARY_CONFIGS).sort()).toEqual(
    ["anime", "anime-movie", "cartoon", "comic", "manga", "movie", "novel", "tv-show"]
  );
  for (const cfg of Object.values(LIBRARY_CONFIGS)) {
    expect(cfg.tableColumns.length).toBeGreaterThan(3);
    expect(cfg.sortDefs.some((s) => s.key === "my_rating")).toBe(true);
  }
});

it("renders the anime library from its config", async () => {
  mount("/library/anime");
  await waitFor(() => expect(screen.getByText("Frieren")).toBeInTheDocument());
  expect(screen.getByPlaceholderText(LIBRARY_CONFIGS.anime.searchPlaceholder)).toBeInTheDocument();
});

it("sends an unknown type to the under-development page", async () => {
  mount("/library/hologram");
  await waitFor(() => expect(screen.getByText("Not here yet")).toBeInTheDocument());
});
