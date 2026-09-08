// The admin Delete page.
//
// Regression cover for the game branch: it deleted the row but fell through to
// the generic "primary deletion" below it, which re-issued the same DELETE
// against an already-gone id and turned a successful delete into an error
// toast.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

import Delete from "./Delete";

const GAME = {
  system_id: 1,
  public_id: "g-1",
  game_name_en: "Chrono Trigger",
  game_type: "RPG",
  franchise_id: null,
  series_id: null,
};

// Every list endpoint the page loads on mount is empty except the games one.
// Deleting the game must hit /api/game/1 exactly once; a second call would be
// the fall-through bug, and the API answers it with a 404.
function installFetch() {
  const deleted = new Set();
  const fetchMock = vi.fn(async (url, opts = {}) => {
    if (opts.method === "DELETE") {
      const already = deleted.has(url);
      deleted.add(url);
      return {
        ok: !already,
        status: already ? 404 : 200,
        json: async () => ({}),
      };
    }
    const body = String(url).startsWith("/api/game/") ? [GAME] : [];
    return { ok: true, status: 200, json: async () => body };
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

describe("Delete page - game entries", () => {
  beforeEach(() => {
    showToast.mockClear();
  });

  it("reports success and issues one DELETE when a game is deleted", async () => {
    const fetchMock = installFetch();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Delete />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /game/i }));
    await user.type(
      screen.getByPlaceholderText(/search game to delete/i),
      "Chrono",
    );
    await user.click(await screen.findByText("Chrono Trigger"));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(
      await screen.findByRole("button", { name: /confirm delete/i }),
    );

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Deletion successful"),
    );
    expect(showToast).not.toHaveBeenCalledWith("error", expect.anything());
    const gameDeletes = fetchMock.mock.calls.filter(
      ([url, opts]) => opts?.method === "DELETE" && url === "/api/game/1",
    );
    expect(gameDeletes).toHaveLength(1);
  });
});
