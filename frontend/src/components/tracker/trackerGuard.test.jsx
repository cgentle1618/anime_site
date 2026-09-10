// A guest has no tracker.
//
// The personal fields stopped reaching a logged-out visitor on the API side
// (the acting_user_id fallback was removed on 2026-09-10), so the card would
// otherwise render as "My tracker" with an em-dash in every field. The data
// would be right and the framing wrong: there is no "my" without a viewer.
//
// Guarded inside the two components rather than at each of the nine detail
// pages, so a tenth media type cannot forget it - which is exactly what these
// tests pin.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MyTrackerCard from "./MyTrackerCard";
import NovelTrackerBlock from "./NovelTrackerBlock";

const mockAuth = vi.hoisted(() => ({ username: null }));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

const NOVEL = {
  system_id: "novel-1",
  novel_type: "Novel",
  ch_fin: 3,
  vol_fin: 1,
  units: [],
};

describe("the tracker is withheld from a logged-out visitor", () => {
  it("renders nothing at all for MyTrackerCard", () => {
    mockAuth.username = null;
    const { container } = render(
      <MyTrackerCard
        epFin={4}
        epTotal={12}
        watchingStatus="Completed"
        myRating="S"
        isAdmin={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing at all for NovelTrackerBlock", () => {
    mockAuth.username = null;
    const { container } = render(
      <NovelTrackerBlock novel={NOVEL} isAdmin={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders for somebody signed in, admin or not", () => {
    // The gate is "is anyone signed in", not "is this an admin": a user-role
    // account has a list of its own and must see it.
    mockAuth.username = "someone";
    render(
      <MyTrackerCard
        epFin={4}
        epTotal={12}
        watchingStatus="Completed"
        myRating="S"
        isAdmin={false}
      />,
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });
});
