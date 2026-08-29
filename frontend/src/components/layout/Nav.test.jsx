import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Nav from "./Nav";

// Nav pulls the session from context and fires search requests on typing;
// neither is what these tests are about.
// Nav now asks has(permission) rather than reading isAdmin directly, so the
// mock answers from the same flag the tests already toggle.
const auth = {
  isAdmin: false,
  has: (permission) => (permission === "admin" ? auth.isAdmin : true),
  refetchAuth: vi.fn(),
};
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

beforeEach(() => {
  auth.isAdmin = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderNav(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Nav />
    </MemoryRouter>,
  );
}

function tab(name) {
  return screen.getByRole("button", { name: new RegExp(name, "i") });
}

describe("Nav tabs", () => {
  it("marks the tab the current route sits under", () => {
    renderNav("/library/manga");
    expect(tab("library")).toHaveAttribute("aria-current", "page");
    expect(tab("track")).not.toHaveAttribute("aria-current");
  });

  it("marks the tab from a detail page, not just its library", () => {
    renderNav("/franchise/42");
    expect(tab("library")).toHaveAttribute("aria-current", "page");
  });

  it("marks no tab on routes outside every section", () => {
    renderNav("/");
    for (const label of ["library", "track", "insights"]) {
      expect(tab(label)).not.toHaveAttribute("aria-current");
    }
  });
});

describe("Nav panels", () => {
  it("opens a panel on click and closes it on a second click", async () => {
    const user = userEvent.setup();
    renderNav("/");
    expect(tab("track")).toHaveAttribute("aria-expanded", "false");

    await user.click(tab("track"));
    expect(tab("track")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /plan/i })).toBeInTheDocument();

    await user.click(tab("track"));
    expect(tab("track")).toHaveAttribute("aria-expanded", "false");
  });

  it("closes an open panel on Escape and returns focus to its tab", async () => {
    const user = userEvent.setup();
    renderNav("/");

    await user.click(tab("insights"));
    expect(tab("insights")).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(tab("insights")).toHaveAttribute("aria-expanded", "false");
    expect(tab("insights")).toHaveFocus();
  });

  it("groups Collection and Franchise away from ACG and Reality", async () => {
    const user = userEvent.setup();
    renderNav("/");

    await user.click(tab("library"));
    const panel = document.querySelector("[data-nav-panel]");
    const columns = ["Groups", "ACG", "Reality"];
    for (const heading of columns) {
      expect(within(panel).getByText(heading)).toBeInTheDocument();
    }
    // Collection sits in the Groups column, not under Reality.
    const groupsColumn = within(panel).getByText("Groups").parentElement;
    expect(
      within(groupsColumn).getByRole("link", { name: /collection/i }),
    ).toBeInTheDocument();
  });
});

describe("Nav admin gating", () => {
  it("hides the Admin tab from guests", () => {
    renderNav("/");
    expect(
      screen.queryByRole("button", { name: /admin/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the Admin tab to admins", () => {
    auth.isAdmin = true;
    renderNav("/");
    expect(tab("admin")).toBeInTheDocument();
  });

  it("keeps Watch Orders out of every non-admin panel", async () => {
    const user = userEvent.setup();
    renderNav("/");

    for (const label of ["library", "track", "insights"]) {
      await user.click(tab(label));
      expect(
        screen.queryByRole("link", { name: /watch orders/i }),
      ).not.toBeInTheDocument();
      await user.click(tab(label));
    }
  });
});
