// Studio Modify tab: the picker searches all four name fields (not just the
// displayed one), and the save button enforces the at-least-one-name rule.
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

it("finds a studio by a non-displayed name field (e.g. Japanese)", async () => {
  const user = userEvent.setup();
  mount();
  const search = screen.getByPlaceholderText("Search studios to modify...");
  await user.type(search, "サンライズ");
  await waitFor(() => expect(screen.getByText("Sunrise")).toBeInTheDocument());
  expect(screen.getByText("5 credits")).toBeInTheDocument();
});

it("loads the selected studio and disables save with hint when every name is cleared", async () => {
  const user = userEvent.setup();
  mount();
  const search = screen.getByPlaceholderText("Search studios to modify...");
  await user.type(search, "Sunrise");
  await waitFor(() => expect(screen.getByText("Sunrise")).toBeInTheDocument());
  await user.click(screen.getByText("Sunrise"));

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
