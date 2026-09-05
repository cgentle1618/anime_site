// Character Modify tab: picking a character from the search dropdown loads its
// form, and a successful save scrolls the page back to the toast at the top.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import CharacterModifyTab from "./CharacterModifyTab";

const CHARACTERS = [
  {
    system_id: "c1",
    name_en: "Spike Spiegel",
    name_cn: null,
    name_jp: "スパイク・スピーゲル",
    name_alt: null,
    display_name_field: null,
    display_name: "Spike Spiegel",
    gender: null,
    my_rating: null,
    photo_file: null,
    remark: null,
    casting_count: 1,
  },
];

function respond(url) {
  if (url.startsWith("/api/character/c1")) return CHARACTERS[0];
  if (url.startsWith("/api/character/")) return CHARACTERS;
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
          json: () =>
            Promise.resolve({ ...CHARACTERS[0], ...JSON.parse(options.body) }),
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
        <CharacterModifyTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function openSpike(user) {
  mount();
  await user.type(
    screen.getByPlaceholderText("Search characters to modify..."),
    "spike",
  );
  await waitFor(() =>
    expect(screen.getByText("Spike Spiegel")).toBeInTheDocument(),
  );
  await user.click(screen.getByText("Spike Spiegel"));
  await waitFor(() =>
    expect(screen.getByDisplayValue("Spike Spiegel")).toBeInTheDocument(),
  );
}

it("loads the picked character into the form", async () => {
  const user = userEvent.setup();
  await openSpike(user);
  expect(
    screen.getByDisplayValue("スパイク・スピーゲル"),
  ).toBeInTheDocument();
});

// Same reason as the Studio and Person tabs: the toast sits at the top of a
// long form, so a successful save scrolls back up.
it("scrolls to the top after a successful save", async () => {
  const user = userEvent.setup();
  const scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  await openSpike(user);

  await user.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
});
