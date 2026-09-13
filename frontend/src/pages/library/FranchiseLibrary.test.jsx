import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FranchiseLibrary from "./FranchiseLibrary";

const COLLECTIONS = [
  { system_id: "c1", public_id: 1, collection_name_en: "Shonen Jump" },
];

const FRANCHISES = [
  {
    system_id: "f1",
    public_id: 1,
    franchise_name_en: "Attack on Titan",
    franchise_name_cn: "進撃の巨人",
    franchise_type: "ACG",
    collection_id: "c1",
    franchise_expectation: "Highest",
    my_rating: "10",
  },
  {
    system_id: "f2",
    public_id: 2,
    franchise_name_en: "Breaking Bad",
    franchise_type: "TV",
    collection_id: null,
    franchise_expectation: "High",
    my_rating: "9",
  },
];

// An anime, a comic and a game, all under f1. Comic and game are the point:
// both were unfetched, so both were invisible to the cover fallback and
// would undercount the Entries column.
const ANIME = [{ system_id: "a1", public_id: 1, franchise_id: "f1" }];
const COMICS = [{ system_id: "cm1", public_id: 1, franchise_id: "f1" }];
const GAMES = [{ system_id: "g1", public_id: 1, franchise_id: "f1" }];

function bodyFor(url) {
  if (url.startsWith("/api/franchise/")) return FRANCHISES;
  if (url.startsWith("/api/collection/")) return COLLECTIONS;
  if (url.startsWith("/api/anime/")) return ANIME;
  if (url.startsWith("/api/comic/")) return COMICS;
  if (url.startsWith("/api/game/")) return GAMES;
  return [];
}

beforeEach(() => {
  global.fetch = vi.fn((url) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(bodyFor(url)) }),
  );
});

async function renderTableView() {
  render(
    <MemoryRouter>
      <FranchiseLibrary />
    </MemoryRouter>,
  );
  await screen.findByText("進撃の巨人");
  await userEvent.click(screen.getByRole("button", { name: "Table view" }));
  return screen.getByRole("table");
}

/** The <tr> whose first cell holds `name`. */
function rowFor(table, name) {
  const row = within(table)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe("FranchiseLibrary table view", () => {
  it("renders a column per field rather than the not-built placeholder", async () => {
    const table = await renderTableView();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Franchise", "Collection", "Type", "Entries", "Expectation", "My"]);
  });

  it("names the parent collection, and says None when there is none", async () => {
    const table = await renderTableView();
    expect(
      within(rowFor(table, "進撃の巨人")).getByText("Shonen Jump"),
    ).toBeInTheDocument();
    expect(within(rowFor(table, "Breaking Bad")).getByText("None")).toBeInTheDocument();
  });

  it("counts every entry type, including the comic and game tables", async () => {
    const table = await renderTableView();
    // anime a1 + comic cm1 + game g1. Reads 1 when comic and game go
    // unfetched, which is what getFranchiseCover's contract forbids.
    expect(within(rowFor(table, "進撃の巨人")).getByText("3")).toBeInTheDocument();
  });

  it("links a row to the franchise detail page", async () => {
    const table = await renderTableView();
    expect(
      within(rowFor(table, "Breaking Bad")).getByRole("link", { name: /Breaking Bad/ }),
    ).toHaveAttribute("href", "/franchise/2/breaking-bad");
  });

  it("keeps the grid view working", async () => {
    render(
      <MemoryRouter>
        <FranchiseLibrary />
      </MemoryRouter>,
    );
    await screen.findByText("進撃の巨人");
    await waitFor(() => {
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });
});
