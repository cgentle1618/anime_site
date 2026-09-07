import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CharacterLibrary from "./CharacterLibrary";

const CHARACTERS = [
  {
    system_id: "1",
    name_en: "Yuki Nagato",
    display_name: "Yuki Nagato",
    casting_count: 3,
  },
  {
    system_id: "2",
    name_cn: "渡部高志",
    display_name: "渡部高志",
    casting_count: 8,
  },
  {
    system_id: "3",
    name_jp: "諫山創",
    display_name: "諫山創",
    casting_count: 1,
  },
  {
    system_id: "4",
    name_alt: "Nickname Only",
    display_name: "Nickname Only",
    casting_count: 0,
  },
];

function renderLibrary() {
  return render(
    <MemoryRouter>
      <CharacterLibrary />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(CHARACTERS) }),
    ),
  );
});

describe("CharacterLibrary", () => {
  it("fetches via the character endpoint helper", async () => {
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/character/",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("searches across all four name fields", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Yuki Nagato")).toBeInTheDocument(),
    );

    const box = screen.getByRole("searchbox");
    for (const [term, kept] of [
      ["Yuki", "Yuki Nagato"],
      ["渡部", "渡部高志"],
      ["諫山", "諫山創"],
      ["Nickname", "Nickname Only"],
    ]) {
      await user.clear(box);
      await user.type(box, term);
      await waitFor(() => expect(screen.getByText(kept)).toBeInTheDocument());
      expect(screen.queryAllByRole("link")).toHaveLength(1);
    }
  });

  it("sorts by casting count and shows casting_count on the card, not credit_count", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("渡部高志")).toBeInTheDocument(),
    );

    // The card must read casting_count (8), never a blank/zero credit_count.
    const card = screen.getByText("渡部高志").closest("a");
    expect(card).toHaveTextContent("8 castings");

    await user.selectOptions(screen.getByLabelText(/sort/i), "casting_count");
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards[0]).toContain("渡部高志");
  });
});
