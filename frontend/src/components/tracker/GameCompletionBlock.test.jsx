// Frontend: the game detail page's completion block.
//
// Four axes that are answers about a playthrough, not facts about the game:
// how deep the finish went, and whether every ending, achievement and
// collectible was got. They were read-only rows in the Information card, which
// put them beside the release date as though they were catalogue data and gave
// no way to change one without opening the Modify page.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GameCompletionBlock from "./GameCompletionBlock";

const mockAuth = vi.hoisted(() => ({ username: "someone" }));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

const GAME = {
  completion_level: "Main Story",
  all_endings: "Yes",
  all_achievements: "No",
  all_collected: "Inapplicable",
};

describe("GameCompletionBlock", () => {
  it("offers all four axes as dropdowns to an admin", () => {
    mockAuth.username = "admin";
    render(<GameCompletionBlock game={GAME} isAdmin onChange={() => {}} />);

    expect(screen.getByLabelText("Completion Level")).toHaveValue("Main Story");
    expect(screen.getByLabelText("All Endings")).toHaveValue("Yes");
    expect(screen.getByLabelText("All Achievements")).toHaveValue("No");
    expect(screen.getByLabelText("All Collected")).toHaveValue("Inapplicable");
  });

  it("offers Inapplicable on each of the three completion axes", () => {
    // The whole point of the vocabulary: a game with no endings to see is a
    // different answer from one whose endings were missed.
    mockAuth.username = "admin";
    render(<GameCompletionBlock game={GAME} isAdmin onChange={() => {}} />);

    for (const label of ["All Endings", "All Achievements", "All Collected"]) {
      const values = [...screen.getByLabelText(label).options].map(
        (o) => o.value,
      );
      expect(values).toEqual(["", "Yes", "No", "Inapplicable"]);
    }
  });

  it("patches the field that changed, and only that one", async () => {
    mockAuth.username = "admin";
    const onChange = vi.fn();
    render(<GameCompletionBlock game={GAME} isAdmin onChange={onChange} />);

    await userEvent.selectOptions(
      screen.getByLabelText("All Endings"),
      "Inapplicable",
    );
    expect(onChange).toHaveBeenCalledWith({ all_endings: "Inapplicable" });
  });

  it("sends an emptied axis as null rather than an empty string", async () => {
    // "" is the select's unset option; the column's unrecorded state is NULL.
    mockAuth.username = "admin";
    const onChange = vi.fn();
    render(<GameCompletionBlock game={GAME} isAdmin onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText("All Endings"), "");
    expect(onChange).toHaveBeenCalledWith({ all_endings: null });
  });

  it("shows a signed-in non-admin the values without letting them edit", () => {
    mockAuth.username = "someone";
    render(<GameCompletionBlock game={GAME} isAdmin={false} onChange={() => {}} />);

    expect(screen.queryByLabelText("All Endings")).not.toBeInTheDocument();
    expect(screen.getByText("Inapplicable")).toBeInTheDocument();
  });

  it("renders nothing at all for a logged-out visitor", () => {
    // Same gate as MyTrackerCard and NovelTrackerBlock: these are one person's
    // answers, so with nobody signed in there is no "my" to show.
    mockAuth.username = null;
    const { container } = render(
      <GameCompletionBlock game={GAME} isAdmin={false} onChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
