// Dashboard card/list view: one mode for the whole page, remembered in this
// browser, with every division's bar able to change it.
//
// The load-bearing case here is the Progress column. It is the one column
// four media types share, and they do not measure the same thing - an anime
// counts episodes and a manga counts chapters. The unit assertions below are
// what stop the column silently reporting one type's numbers under another
// type's meaning, so a fixture with two different units is deliberate, not
// decoration: with only anime rows every one of these tests would pass while
// the bug was present.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import { DASHBOARD_VIEW_KEY } from "../../lib/dashboardView";
import Index from "./Index";

function respond(url) {
  if (url.startsWith("/api/auth/me")) {
    return { is_admin: false, username: null, role: "guest", is_root: false, permissions: [] };
  }
  if (url.startsWith("/api/anime/"))
    return [
      {
        system_id: "a1",
        public_id: 101,
        anime_name_en: "Frieren",
        franchise_id: "f1",
        watching_status: "Active Watching",
        airing_status: "Airing",
        my_rating: "S",
        ep_fin: 12,
        ep_total: 28,
      },
    ];
  if (url.startsWith("/api/manga/"))
    return [
      {
        system_id: "m1",
        public_id: 202,
        manga_name_en: "Berserk",
        franchise_id: "f3",
        reading_status: "Active Reading",
        ch_fin: 97,
        ch_total: 364,
      },
    ];
  if (url.startsWith("/api/franchise/")) return [];
  return [];
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url))) })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

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

function rowFor(title) {
  return screen.getByText(title).closest("tr");
}

it("starts in card view, with no table on the page", async () => {
  mount();
  await loaded();
  expect(screen.queryAllByRole("table")).toHaveLength(0);
  const bar = within(screen.getByTestId("watching-filter"));
  expect(bar.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
  expect(bar.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "false");
});

it("switching to list renders tables with the five columns and remembers the choice", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();

  await user.click(within(screen.getByTestId("watching-filter")).getByRole("button", { name: "List" }));

  const tables = screen.getAllByRole("table");
  expect(tables.length).toBeGreaterThan(0);
  const headers = within(tables[0])
    .getAllByRole("columnheader")
    .map((th) => th.textContent);
  expect(headers).toEqual(["Title", "Type", "Status", "Rating", "Progress"]);
  expect(localStorage.getItem(DASHBOARD_VIEW_KEY)).toBe("list");
});

it("the mode is one setting: flipping it in one division changes the others", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();

  await user.click(within(screen.getByTestId("reading-filter")).getByRole("button", { name: "List" }));

  for (const barId of ["watching-filter", "reading-filter"]) {
    const bar = within(screen.getByTestId(barId));
    expect(bar.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(bar.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "false");
  }
  // Both divisions' entries are now rows, not cards.
  expect(rowFor("Frieren")).not.toBeNull();
  expect(rowFor("Berserk")).not.toBeNull();
});

it("opens in list view when this browser already chose it", async () => {
  localStorage.setItem(DASHBOARD_VIEW_KEY, "list");
  mount();
  await loaded();
  expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
});

it("opens in card view when the stored value is not a mode", async () => {
  localStorage.setItem(DASHBOARD_VIEW_KEY, "table");
  mount();
  await loaded();
  expect(screen.queryAllByRole("table")).toHaveLength(0);
});

it("each row reports progress in its own media type's unit", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();
  await user.click(within(screen.getByTestId("watching-filter")).getByRole("button", { name: "List" }));

  // An anime counts episodes and a manga counts chapters. If the Progress
  // column ever derives its unit from one shared branch, one of these two
  // breaks - which is the entire reason both types are in the fixture.
  expect(within(rowFor("Frieren")).getByText("12/28 ep")).toBeInTheDocument();
  expect(within(rowFor("Berserk")).getByText("97/364 ch")).toBeInTheDocument();
});

it("a row carries the entry's type, status and rating", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();
  await user.click(within(screen.getByTestId("watching-filter")).getByRole("button", { name: "List" }));

  const row = within(rowFor("Frieren"));
  expect(row.getByText("Anime")).toBeInTheDocument();
  expect(row.getByText("Airing")).toBeInTheDocument();
  expect(row.getByLabelText("Rating S")).toBeInTheDocument();
});

it("a title in list view still links to its entry", async () => {
  const user = userEvent.setup();
  mount();
  await loaded();
  await user.click(within(screen.getByTestId("watching-filter")).getByRole("button", { name: "List" }));

  expect(within(rowFor("Frieren")).getByRole("link", { name: "Frieren" })).toHaveAttribute(
    "href",
    expect.stringContaining("/anime/"),
  );
});
