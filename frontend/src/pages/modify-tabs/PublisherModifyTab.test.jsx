// Publisher Modify tab: the picker lists every publisher up front (like the
// Studio tab it is modelled on), the search box filters that list across all
// four name fields (not just the displayed one), the save button enforces the
// at-least-one-name rule, and the PUT body carries the whole record.
//
// Two deliberate divergences from StudioModifyTab: no MAL fields (a publisher
// has no MAL record) and no Japan country seeding (a publisher is as likely
// to be American as Japanese).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import PublisherModifyTab from "./PublisherModifyTab";

const PUBLISHERS = [
  {
    system_id: "p1",
    name_en: "Bandai Namco",
    name_cn: null,
    name_jp: "バンダイナムコ",
    name_alt: null,
    display_name_field: null,
    display_name: "Bandai Namco",
    credit_count: 5,
    logo_file: null,
    my_rating: null,
    founded_date: null,
    defunct_date: null,
    country: null,
    website_url: null,
    remark: null,
  },
  {
    system_id: "p2",
    name_en: "Muse Communication",
    name_cn: "木棉花",
    name_jp: null,
    name_alt: null,
    display_name_field: "cn",
    display_name: "木棉花",
    credit_count: 2,
    logo_file: null,
    my_rating: null,
    founded_date: null,
    defunct_date: null,
    country: null,
    website_url: null,
    remark: null,
  },
];

function respond(url) {
  if (url.startsWith("/api/publisher/p1")) return PUBLISHERS[0];
  if (url.startsWith("/api/publisher/")) return PUBLISHERS;
  return [];
}

let lastPut;

beforeEach(() => {
  lastPut = null;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options = {}) => {
      if (options.method === "PUT") {
        lastPut = { url: String(url), body: JSON.parse(options.body) };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ ...PUBLISHERS[0], ...JSON.parse(options.body) }),
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PublisherModifyTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it("lists every publisher by display name before anything is typed", async () => {
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Bandai Namco" }),
    ).toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "木棉花" })).toBeInTheDocument();
});

it("filters the list by a non-displayed name field", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Bandai Namco" }),
    ).toBeInTheDocument(),
  );
  await user.type(
    screen.getByPlaceholderText("Search publishers to modify..."),
    "Muse Communication",
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Bandai Namco" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "木棉花" })).toBeInTheDocument();
});

it("disables save once every name is cleared", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Bandai Namco" }),
    ).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Bandai Namco" }));

  await waitFor(() =>
    expect(screen.getByDisplayValue("Bandai Namco")).toBeInTheDocument(),
  );
  const saveButton = screen.getByRole("button", { name: /save changes/i });
  expect(saveButton).not.toBeDisabled();

  await user.clear(screen.getByDisplayValue("Bandai Namco"));
  await user.clear(screen.getByDisplayValue("バンダイナムコ"));

  expect(
    screen.getByText("A publisher needs at least one name."),
  ).toBeInTheDocument();
  expect(saveButton).toBeDisabled();
});

it("PUTs the edited record to the publisher endpoint", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Bandai Namco" }),
    ).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Bandai Namco" }));
  await waitFor(() =>
    expect(screen.getByDisplayValue("Bandai Namco")).toBeInTheDocument(),
  );

  const enField = screen.getByDisplayValue("Bandai Namco");
  await user.clear(enField);
  await user.type(enField, "Bandai Namco Entertainment");
  await user.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() => expect(lastPut).not.toBeNull());
  expect(lastPut.url).toBe("/api/publisher/p1");
  expect(lastPut.body.name_en).toBe("Bandai Namco Entertainment");
  expect(lastPut.body.name_jp).toBe("バンダイナムコ");
  // A publisher has no MAL record; the form must not invent those columns.
  expect(lastPut.body).not.toHaveProperty("mal_id");
  expect(lastPut.body).not.toHaveProperty("mal_link");
});

// StudioModifyTab seeds an unrecorded country to Japan because nearly every
// studio here is Japanese. Publishers are not, so an empty country stays empty.
it("does not seed a country", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Bandai Namco" }),
    ).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Bandai Namco" }));
  await waitFor(() =>
    expect(screen.getByDisplayValue("Bandai Namco")).toBeInTheDocument(),
  );
  expect(screen.queryByDisplayValue("Japan")).not.toBeInTheDocument();
});
