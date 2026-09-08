// Person Modify tab: the picker lists everyone holding the selected sub-tab's
// role up front (like the system options grid), by display name, and the
// search box filters that list across all four name fields.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import PersonModifyTab from "./PersonModifyTab";

const DIRECTORS = [
  {
    system_id: "p1",
    name_en: "Hayao Miyazaki",
    name_cn: null,
    name_jp: "宮崎駿",
    name_alt: null,
    display_name_field: null,
    display_name: "Hayao Miyazaki",
    gender: null,
    my_rating: null,
    photo_file: null,
    credit_count: 3,
    roles: [{ role: "director", scope: "anime" }],
  },
  {
    system_id: "p2",
    name_en: "Mamoru Hosoda",
    name_cn: null,
    name_jp: "細田守",
    name_alt: null,
    display_name_field: null,
    display_name: "Mamoru Hosoda",
    gender: null,
    my_rating: null,
    photo_file: null,
    credit_count: 1,
    roles: [{ role: "director", scope: "anime" }],
  },
  {
    system_id: "p3",
    name_en: "Makoto Shinkai",
    name_cn: null,
    name_jp: "新海誠",
    name_alt: null,
    display_name_field: null,
    display_name: "Makoto Shinkai",
    gender: null,
    my_rating: null,
    photo_file: null,
    credit_count: 2,
    roles: [{ role: "director", scope: "anime-movie" }],
  },
  {
    system_id: "p4",
    name_en: "Christopher Nolan",
    name_cn: null,
    name_jp: null,
    name_alt: null,
    display_name_field: null,
    display_name: "Christopher Nolan",
    gender: null,
    my_rating: null,
    photo_file: null,
    credit_count: 5,
    roles: [{ role: "director", scope: "movie" }],
  },
];

const ROLE_SCOPES = {
  director: ["anime", "anime-movie", "movie"],
  producer: ["anime"],
};

function respond(url) {
  if (url.startsWith("/api/person/p1")) return DIRECTORS[0];
  if (url.startsWith("/api/person/role-scopes")) return ROLE_SCOPES;
  if (url.startsWith("/api/person/?role=director")) return DIRECTORS;
  if (url.startsWith("/api/person/")) return [];
  return [];
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(String(url))),
      }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PersonModifyTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it("lists everyone in the sub-tab's role by display name before anything is typed", async () => {
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Mamoru Hosoda" }),
  ).toBeInTheDocument();
  // Display name only - no credit-count subtitle in the grid.
  expect(screen.queryByText("3 credits")).not.toBeInTheDocument();
});

it("filters the list by a non-displayed name field (e.g. Japanese)", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );
  await user.type(
    screen.getByPlaceholderText("Search people to modify..."),
    "宮崎",
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Mamoru Hosoda" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Hayao Miyazaki" }),
  ).toBeInTheDocument();
});

it("filters the list to the scopes ticked, matching any one of them", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );

  // One scope: only the people holding the sub-tab's role in it.
  await user.click(screen.getByRole("button", { name: "anime-movie" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Hayao Miyazaki" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Makoto Shinkai" }),
  ).toBeInTheDocument();

  // A second scope widens the list - in scope for EITHER is enough.
  await user.click(screen.getByRole("button", { name: "anime" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Makoto Shinkai" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Christopher Nolan" }),
  ).not.toBeInTheDocument();

  // Unticking every scope goes back to showing everyone.
  await user.click(screen.getByRole("button", { name: "anime-movie" }));
  await user.click(screen.getByRole("button", { name: "anime" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Christopher Nolan" }),
    ).toBeInTheDocument(),
  );
});

it("offers no scope filter for a role with a single legal scope", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "anime-movie" }),
    ).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: /Producer/ }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "anime-movie" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: "anime" })).not.toBeInTheDocument();
});

// Same reason as the Studio tab: the toast sits at the top of a long form.
it("scrolls to the top after a successful save", async () => {
  const user = userEvent.setup();
  const scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Hayao Miyazaki" }),
    ).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Hayao Miyazaki" }));
  await waitFor(() =>
    expect(screen.getByDisplayValue("Hayao Miyazaki")).toBeInTheDocument(),
  );

  await user.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
});
