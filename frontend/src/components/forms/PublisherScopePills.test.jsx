import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublisherScopePills from "./PublisherScopePills";

describe("PublisherScopePills", () => {
  it("renders one pill per media type a publisher may be offered on", () => {
    render(<PublisherScopePills scopes={[]} setScopes={() => {}} />);
    ["Anime", "Anime Movie", "Manga", "Novel", "Comic", "Game"].forEach((l) =>
      expect(screen.getByRole("button", { name: l })).toBeInTheDocument(),
    );
  });

  it("adds a scope without removing the ones already held", () => {
    const setScopes = vi.fn();
    render(<PublisherScopePills scopes={["anime"]} setScopes={setScopes} />);
    fireEvent.click(screen.getByRole("button", { name: "Manga" }));
    expect(setScopes).toHaveBeenCalledWith(["anime", "manga"]);
  });

  it("removes a held scope when its pill is clicked again", () => {
    const setScopes = vi.fn();
    render(
      <PublisherScopePills scopes={["anime", "manga"]} setScopes={setScopes} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Anime" }));
    expect(setScopes).toHaveBeenCalledWith(["manga"]);
  });

  // Zero rows means "offered nowhere", not "offered everywhere" - see
  // PublisherScope's docstring in app/models/staff.py. The form has to say so,
  // because an empty pill row otherwise reads as "no restriction".
  it("says an unscoped publisher is offered nowhere", () => {
    render(<PublisherScopePills scopes={[]} setScopes={() => {}} />);
    expect(screen.getByText(/offered nowhere/i)).toBeInTheDocument();
  });

  it("tolerates a missing scopes prop", () => {
    const setScopes = vi.fn();
    render(<PublisherScopePills setScopes={setScopes} />);
    fireEvent.click(screen.getByRole("button", { name: "Game" }));
    expect(setScopes).toHaveBeenCalledWith(["game"]);
  });
});
