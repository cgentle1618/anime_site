// Frontend: the game detail page's progress block.
//
// A game has no episode counter. Its progress is playtime against the
// main-story estimate, plus achievements when the game reports a total —
// so the block must render nothing at all rather than a misleading "0 h".
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameCopiesSection, GameProgress, outOf, yesNo } from "./Game";

describe("GameProgress", () => {
  it("shows playtime against the main-story estimate", () => {
    render(<GameProgress game={{ hours_played: 32.5, hltb_main: 45 }} />);
    expect(screen.getByText(/32\.5 h/)).toBeInTheDocument();
    expect(screen.getByText(/45 h/)).toBeInTheDocument();
  });

  it("shows achievements only when a total is known", () => {
    const { rerender } = render(
      <GameProgress game={{ achievements_earned: 12, achievements_total: 40 }} />
    );
    expect(screen.getByText(/12 \/ 40/)).toBeInTheDocument();

    rerender(<GameProgress game={{ achievements_earned: 12 }} />);
    expect(screen.queryByText(/12 \/ 40/)).not.toBeInTheDocument();
  });

  it("renders nothing rather than a zero when there is no playtime", () => {
    const { container } = render(<GameProgress game={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// The three completion flags are tristate. Unknown must stay blank on the
// page: rendering "No" would claim the endings were missed.
describe("yesNo", () => {
  it("renders the two answers and drops the unknown", () => {
    expect(yesNo(true)).toBe("Yes");
    expect(yesNo(false)).toBe("No");
    expect(yesNo(null)).toBeNull();
    expect(yesNo(undefined)).toBeNull();
  });
});

// The two Metacritic figures sit on different scales — critics out of 100,
// users out of 10 — so each carries its denominator, and an unscored game
// drops the row rather than showing a zero.
describe("outOf", () => {
  it("keeps each score on its own scale", () => {
    expect(outOf(96, 100)).toBe("96 / 100");
    expect(outOf(8.6, 10)).toBe("8.6 / 10");
  });

  it("drops a missing or unreadable score", () => {
    expect(outOf(null, 100)).toBeNull();
    expect(outOf("", 10)).toBeNull();
    expect(outOf("n/a", 100)).toBeNull();
  });
});

// The copies a game is owned in are stored and saved by the form, but the
// detail page used to count them in the Info card and never show them. This
// section is the missing display.
describe("GameCopiesSection", () => {
  const steam = {
    system_id: "c1",
    position: 1,
    storefront: "Steam",
    ownership: "Owned",
    copy_format: "Digital",
    acquisition: "Bought",
    price_paid: "9.99",
    price_currency: "USD",
    acquired_date: "2024-05-17",
    remark: "summer sale",
  };

  it("shows every field of a copy", () => {
    render(<GameCopiesSection copies={[steam]} />);
    expect(screen.getByText("Steam")).toBeInTheDocument();
    expect(screen.getByText("Owned")).toBeInTheDocument();
    expect(screen.getByText("Digital")).toBeInTheDocument();
    expect(screen.getByText("Bought")).toBeInTheDocument();
    expect(screen.getByText("USD 9.99")).toBeInTheDocument();
    expect(screen.getByText("2024-05-17")).toBeInTheDocument();
    expect(screen.getByText("summer sale")).toBeInTheDocument();
  });

  it("orders the rows by position", () => {
    const { container } = render(
      <GameCopiesSection
        copies={[
          { system_id: "b", position: 2, storefront: "GOG" },
          { system_id: "a", position: 1, storefront: "Steam" },
        ]}
      />
    );
    expect(container.textContent.indexOf("Steam")).toBeLessThan(
      container.textContent.indexOf("GOG")
    );
  });

  // A price with no currency beside it is still worth showing; a currency
  // with no price is not.
  it("drops an empty price instead of printing a bare currency", () => {
    render(
      <GameCopiesSection copies={[{ system_id: "c", storefront: "GOG", price_currency: "USD" }]} />
    );
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it("renders nothing when the game has no copies", () => {
    const { container } = render(<GameCopiesSection copies={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
