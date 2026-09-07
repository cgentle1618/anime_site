// Frontend: the game detail page's progress block.
//
// A game has no episode counter. Its progress is playtime against the
// main-story estimate, plus achievements when the game reports a total —
// so the block must render nothing at all rather than a misleading "0 h".
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameProgress, outOf, yesNo } from "./Game";

describe("GameProgress", () => {
  it("shows playtime against the main-story estimate", () => {
    render(<GameProgress game={{ hours_played: 32.5, hltb_main: 45 }} />);
    expect(screen.getByText(/32\.5 h/)).toBeInTheDocument();
    expect(screen.getByText(/45 h/)).toBeInTheDocument();
  });

  it("shows achievements only when a total is known", () => {
    const { rerender } = render(
      <GameProgress game={{ achievements_earned: 12, achievements_total: 40 }} />,
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
