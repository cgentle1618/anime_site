// Frontend: the IGDB picker at the top of the Add form's Game tab.
//
// IGDB is the only handle Fill has on a game, so the admin picks the right
// entry here before saving. The endpoint answers with IGDB's raw game objects,
// so this widget reads `id`, `name`, `first_release_date` (Unix seconds) and
// `cover.url` (protocol-relative) itself.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GameAddTab from "./GameAddTab";
import { defaultGame } from "../../config/formFactories";

// The form asks who is editing, because the Copies section is gated on
// self.list - a copy is personal ownership, not catalogue data. These tests
// are about the IGDB picker, so the account is whatever is convenient; the
// gate itself is tested in GameCopiesGate.test.jsx.
let mockHas = () => true;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: mockHas }),
}));

const ELDEN = {
  id: 119133,
  name: "Elden Ring",
  first_release_date: 1645747200, // 2022-02-25 UTC
  cover: { url: "//images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg" },
  url: "https://www.igdb.com/games/elden-ring",
};

function renderTab(props = {}) {
  return render(
    <GameAddTab
      franchiseCollections={{}}
      gmf={defaultGame()}
      ugm={() => {}}
      allFranchises={[]}
      allGames={[]}
      seriesItemsForGame={[]}
      sources={[]}
      applyGameAutofill={() => {}}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([ELDEN]) }),
    ),
  );
});

describe("GameAddTab IGDB search", () => {
  it("queries the admin search endpoint once the typing settles", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(screen.getByPlaceholderText(/search igdb/i), "elden");
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/game/search-igdb?q=elden&limit=10",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    // Debounced: the five keystrokes are one request, not five.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("reads the raw IGDB shape for the result row", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(screen.getByPlaceholderText(/search igdb/i), "elden");
    const row = await screen.findByRole("button", { name: /Elden Ring/ });
    expect(row).toHaveTextContent("2022");
    expect(screen.getByAltText("Elden Ring")).toHaveAttribute(
      "src",
      "https://images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg",
    );
  });

  it("hands the picked game to applyGameAutofill", async () => {
    const user = userEvent.setup();
    const applyGameAutofill = vi.fn();
    renderTab({ applyGameAutofill });
    await user.type(screen.getByPlaceholderText(/search igdb/i), "elden");
    await user.click(await screen.findByRole("button", { name: /Elden Ring/ }));
    expect(applyGameAutofill).toHaveBeenCalledWith(ELDEN);
  });
});
