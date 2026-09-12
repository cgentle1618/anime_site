// Frontend: the Copies section of the Game form is gated on self.list.
//
// A copy is a personal-ownership row that happens to be edited from a
// catalogue form. The page itself requires manage.catalog; the Copies section
// requires the different question "may this account keep rows of its own",
// which since 2026-09-12 an administrative account answers no to. The server
// skips a `copies` payload from such a caller for the same reason
// (app/services/domain/game_copies.py), so this is the first of two stops
// rather than the only one.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameFormBody } from "./GameAddTab";
import { defaultGame } from "../../config/formFactories";

let mockHas = () => true;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: mockHas }),
}));

function renderBody() {
  return render(
    <GameFormBody f={defaultGame()} u={() => {}} allGames={[]} sources={[]} />,
  );
}

describe("the Copies section", () => {
  it("is rendered for an account that may keep a library", () => {
    mockHas = (p) => p === "self.list";
    renderBody();
    expect(screen.getAllByText("Copies").length).toBeGreaterThan(0);
  });

  it("is absent for an account that may not", () => {
    // The mirror of the test above, same form and same props, so a green
    // there proves the permission did the hiding rather than the section
    // being absent for some unrelated reason.
    mockHas = () => false;
    renderBody();
    expect(screen.queryAllByText("Copies")).toHaveLength(0);
  });
});
