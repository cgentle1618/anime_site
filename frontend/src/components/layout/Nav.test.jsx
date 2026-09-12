import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../contexts/ThemeContext";
import Nav from "./Nav";

// Nav pulls the session from context and fires search requests on typing;
// neither is what these tests are about.
// Nav now asks has(permission) rather than reading isAdmin directly, so the
// mock answers from the same flag the tests already toggle: isAdmin true
// holds every admin capability (admin.authz, manage.catalog,
// manage.pipelines) the way an is_superuser account would, isAdmin false
// holds none of them — except self.list, which these tests don't exercise
// but a signed-out visitor genuinely lacks and a signed-in one holds.
const auth = {
  isAdmin: false,
  username: null,
  has: (permission) =>
    permission === "self.list" ? true : auth.isAdmin,
  refetchAuth: vi.fn(),
};
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));
const { hardNavigate } = vi.hoisted(() => ({ hardNavigate: vi.fn() }));
vi.mock("../../lib/hardNavigate", () => ({ hardNavigate }));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

beforeEach(() => {
  auth.isAdmin = false;
  auth.username = null;
  hardNavigate.mockClear();
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
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>
        <Nav />
      </MemoryRouter>
    </ThemeProvider>,
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

// The header "Log in" button builds its next= from wherever the visitor
// currently is. On /login that used to nest the login page inside its own
// next - /login?next=%2Flogin%3Fnext%3D%252Fstatistics - so a visitor who was
// bounced to /login from a protected page and then clicked this button
// instead of filling in the form had their real destination buried one level
// down, and Login.jsx would navigate them straight back to the login form.
describe("Nav - the log in link's next", () => {
  it("carries the page the visitor actually wanted", () => {
    renderNav("/statistics");
    for (const link of screen.getAllByRole("link", { name: /log in/i })) {
      expect(link).toHaveAttribute("href", "/login?next=%2Fstatistics");
    }
  });

  it("does not nest /login inside its own next when already on /login", () => {
    renderNav("/login?next=%2Fstatistics");
    for (const link of screen.getAllByRole("link", { name: /log in/i })) {
      // The next ProtectedRoute already put there is preserved, not rebuilt
      // around the login page itself.
      expect(link).toHaveAttribute("href", "/login?next=%2Fstatistics");
    }
  });

  it("leaves a bare /login alone rather than pointing next at it", () => {
    renderNav("/login");
    for (const link of screen.getAllByRole("link", { name: /log in/i })) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });
});

describe("Nav - logging out", () => {
  // The leak this pins: signing out only swapped the auth snapshot, so every
  // answer React Query had already cached for the outgoing account kept being
  // served - a dashboard still showing that account's rows to a guest. A full
  // load of the same page is what evicts them.
  it("reloads the page it is on rather than routing to it", async () => {
    auth.isAdmin = true;
    auth.username = "cg1618";
    const user = userEvent.setup();
    renderNav("/statistics?tab=anime");

    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
    expect(hardNavigate).toHaveBeenCalledWith("/statistics?tab=anime");
  });
});

describe("Nav - who the strip says you are", () => {
  // The strip used to render nothing at all unless isAdmin, so a signed-in
  // account that is not an admin saw no name and no way out. All three states
  // are asserted together: the guest case alone would pass for a strip that
  // renders "Guest" unconditionally.
  it("names a logged-out visitor as a guest, with nothing to log out of", () => {
    renderNav("/");
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /log out/i })).toBeNull();
    expect(screen.getByRole("link", { name: /log in/i })).toBeTruthy();
  });

  it("names a signed-in account and offers it a way out, admin or not", () => {
    auth.username = "bob";
    renderNav("/");
    expect(screen.getByText("bob")).toBeTruthy();
    expect(screen.getByRole("button", { name: /log out/i })).toBeTruthy();
    // The role chip is a capability, not an identity - it stays gated. The
    // selector matters: the Admin nav TAB carries the same word.
    expect(screen.queryByText("Admin", { selector: "span" })).toBeNull();
  });

  it("keeps the Admin chip beside the name for an admin", () => {
    auth.isAdmin = true;
    auth.username = "cg1618";
    renderNav("/");
    expect(screen.getByText("cg1618")).toBeTruthy();
    expect(screen.getByText("Admin", { selector: "span" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /log out/i })).toBeTruthy();
  });
});
