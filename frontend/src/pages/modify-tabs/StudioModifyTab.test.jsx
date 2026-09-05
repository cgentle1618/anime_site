// Studio Modify tab: the picker lists every studio up front (like the system
// options grid), the search box filters that list across all four name fields
// (not just the displayed one), and the save button enforces the
// at-least-one-name rule.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import StudioModifyTab from "./StudioModifyTab";

const STUDIOS = [
  {
    system_id: "s1",
    name_en: "Sunrise",
    name_cn: null,
    name_jp: "サンライズ",
    name_alt: null,
    display_name_field: null,
    display_name: "Sunrise",
    credit_count: 5,
    logo_file: null,
    my_rating: null,
    founded_date: null,
    defunct_date: null,
    country: null,
    website_url: null,
    mal_id: null,
    mal_link: null,
  },
  {
    system_id: "s2",
    name_en: "Kyoto Animation",
    name_cn: null,
    name_jp: "京都アニメーション",
    name_alt: null,
    display_name_field: null,
    display_name: "Kyoto Animation",
    credit_count: 2,
    logo_file: null,
    my_rating: null,
    founded_date: null,
    defunct_date: null,
    country: null,
    website_url: null,
    mal_id: null,
    mal_link: null,
  },
];

function respond(url) {
  if (url.startsWith("/api/studio/s1")) return STUDIOS[0];
  if (url.startsWith("/api/studio/")) return STUDIOS;
  return [];
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      if (options.method === "PUT") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ...STUDIOS[0], ...JSON.parse(options.body) }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(String(url))),
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <StudioModifyTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it("lists every studio by display name before anything is typed", async () => {
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Kyoto Animation" }),
  ).toBeInTheDocument();
  // Display name only - no credit-count subtitle in the grid.
  expect(screen.queryByText("5 credits")).not.toBeInTheDocument();
});

it("filters the list by a non-displayed name field (e.g. Japanese)", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument(),
  );
  await user.type(
    screen.getByPlaceholderText("Search studios to modify..."),
    "サンライズ",
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Kyoto Animation" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument();
});

it("loads the selected studio and disables save with hint when every name is cleared", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sunrise" })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Sunrise" }));

  await waitFor(() =>
    expect(screen.getByDisplayValue("Sunrise")).toBeInTheDocument(),
  );
  const saveButton = screen.getByRole("button", { name: /save changes/i });
  expect(saveButton).not.toBeDisabled();

  await user.clear(screen.getByDisplayValue("Sunrise"));
  await user.clear(screen.getByDisplayValue("サンライズ"));

  expect(
    screen.getByText("A studio needs at least one name."),
  ).toBeInTheDocument();
  expect(saveButton).toBeDisabled();
});
