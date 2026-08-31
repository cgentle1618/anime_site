// Dashboard type filter: one single-select filter shared by the Watching and
// Reading divisions (rendered under both headers); filtering shows one type
// only across the whole page and pins the bars as sticky headers.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Index from "./Index";

function respond(url) {
  if (url.startsWith("/api/auth/me")) {
    return { is_admin: false, username: null, role: "guest", is_superuser: false, permissions: [] };
  }
  if (url.startsWith("/api/anime/"))
    return [{ system_id: "a1", anime_name_en: "Frieren", franchise_id: "f1", watching_status: "Active Watching" }];
  if (url.startsWith("/api/tv-shows/"))
    return [{ system_id: "t1", tv_name_en: "Severance", franchise_id: "f2", watching_status: "Active Watching" }];
  if (url.startsWith("/api/manga/"))
    return [{ system_id: "m1", manga_name_en: "Berserk", franchise_id: "f3", reading_status: "Active Reading" }];
  if (url.startsWith("/api/comic/"))
    return [{ system_id: "c1", comic_name_en: "Saga", franchise_id: "f4", reading_status: "Active Reading" }];
  if (url.startsWith("/api/franchise/")) return [];
  return [];
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url))) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <Index />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function loaded() {
  await waitFor(() => expect(screen.getByText("Frieren")).toBeInTheDocument());
}

it("renders the combined type filter bar in both divisions", async () => {
  mount();
  await loaded();
  for (const barId of ["watching-filter", "reading-filter"]) {
    const bar = within(screen.getByTestId(barId));
    for (const label of ["All", "Anime", "TV Show", "Cartoon", "Manga", "Novel", "Comic"]) {
      expect(bar.getByRole("button", { name: label })).toBeInTheDocument();
    }
  }
});

it("picking a type filters both divisions to that type only", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();
  expect(screen.getByText("Severance")).toBeInTheDocument();
  expect(screen.getByText("Berserk")).toBeInTheDocument();

  const watching = within(screen.getByTestId("watching-filter"));
  await user.click(watching.getByRole("button", { name: "Anime" }));
  expect(screen.getByText("Frieren")).toBeInTheDocument();
  expect(screen.queryByText("Severance")).not.toBeInTheDocument();
  expect(screen.queryByText("Berserk")).not.toBeInTheDocument();

  // Clicking the active type again returns to All
  await user.click(watching.getByRole("button", { name: "Anime" }));
  expect(screen.getByText("Severance")).toBeInTheDocument();
  expect(screen.getByText("Berserk")).toBeInTheDocument();
});

it("the two bars share one filter state", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();
  const reading = within(screen.getByTestId("reading-filter"));
  await user.click(reading.getByRole("button", { name: "Comic" }));
  expect(screen.getByText("Saga")).toBeInTheDocument();
  expect(screen.queryByText("Berserk")).not.toBeInTheDocument();
  expect(screen.queryByText("Frieren")).not.toBeInTheDocument();
  // Clearing from the other bar restores everything
  const watching = within(screen.getByTestId("watching-filter"));
  await user.click(watching.getByRole("button", { name: "All" }));
  expect(screen.getByText("Frieren")).toBeInTheDocument();
  expect(screen.getByText("Berserk")).toBeInTheDocument();
});

it("both bars are sticky only while a filter is active", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();
  const watchBar = screen.getByTestId("watching-filter");
  const readBar = screen.getByTestId("reading-filter");
  expect(watchBar.className).not.toMatch(/sticky/);
  expect(readBar.className).not.toMatch(/sticky/);
  await user.click(within(watchBar).getByRole("button", { name: "Manga" }));
  expect(watchBar.className).toMatch(/sticky/);
  expect(readBar.className).toMatch(/sticky/);
  await user.click(within(readBar).getByRole("button", { name: "All" }));
  expect(watchBar.className).not.toMatch(/sticky/);
  expect(readBar.className).not.toMatch(/sticky/);
});
