// Frontend: the series hub's Game tab.
//
// A game can be filed under a series, so the series page has to fetch and show
// them; without the tab the entry exists but is invisible from its own series.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeriesPage from "./SeriesPage";
import { ToastProvider } from "../../hooks/useToast";
import { AuthProvider } from "../../contexts/AuthContext";

const SERIES = {
  system_id: "SR001",
  series_name_en: "Elden Ring Series",
  series_name_cn: "艾爾登法環系列",
};

const GAMES = [
  {
    system_id: "GM001",
    game_name_en: "Elden Ring",
    game_name_cn: "艾爾登法環",
    game_type: "Base Game",
    playing_status: "Completed",
    release_date: "2022-02-25",
    my_rating: "S",
  },
  {
    system_id: "GM002",
    game_name_en: "Shadow of the Erdtree",
    game_name_cn: "黃金樹幽影",
    game_type: "DLC",
    playing_status: "Plan to Play",
    release_date: "2024-06-21",
  },
];

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      if (String(url).startsWith("/api/series/")) return jsonRes(SERIES);
      if (String(url).startsWith("/api/game/")) return jsonRes(GAMES);
      return jsonRes([]);
    }),
  );
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={["/series/SR001"]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/series/:system_id" element={<SeriesPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
    </QueryClientProvider>,
  );
}

const gameTab = (name) => name.startsWith("Game");

describe("SeriesPage games", () => {
  it("fetches the games filed under the series", async () => {
    renderPage();
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/game/?series_id=SR001",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });

  it("offers a Game tab and lists them", async () => {
    const user = userEvent.setup();
    renderPage();
    // The tab label carries its count, so the name is matched by prefix.
    await user.click(await screen.findByRole("button", { name: gameTab }));
    expect(await screen.findByText("艾爾登法環")).toBeInTheDocument();
    expect(screen.getByText("黃金樹幽影")).toBeInTheDocument();
  });

  it("filters the list by playing status", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: gameTab }));
    await user.click(await screen.findByRole("button", { name: "Completed" }));
    await waitFor(() =>
      expect(screen.queryByText("黃金樹幽影")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("艾爾登法環")).toBeInTheDocument();
  });
});
