// Frontend: an Add tab has no row id until its entry is saved, so
// ImagePicker cannot attach the picked image at pick time - it hands the
// image id up as `pending_image_id` instead (see ImagePicker.jsx's module
// comment and config/formFactories.js). This mirrors Add.person.test.jsx for
// a MEDIA entry tab rather than an entity tab: Anime goes through the
// `media` supertable and the `af` form state, a different shape from
// Person's find-or-create /api/person - this test guards that the same
// attach-after-save wiring holds there too. Once the anime is created,
// submitAnime() must attach the pending image itself, using the new entry's
// id, and must surface a failure to attach rather than dropping it silently
// - a dropped attach would leave the upload orphaned and show as Unused on
// /images, where the unused-only Delete would remove a file the saved entry
// still points at.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Add from "./Add";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const attachUploadedImage = vi.fn();
// Mocking the module ImagePicker.jsx resolves to (shared by every Add tab) -
// a stub button stands in for the real upload widget so the test exercises
// Add.jsx's save flow, not file inputs and FormData.
vi.mock("../../components/forms/ImagePicker", () => ({
  default: ({ onChange }) => (
    <button
      type="button"
      onClick={() => onChange("library/new.jpg", "img-1")}
    >
      Simulate image pick
    </button>
  ),
  attachUploadedImage: (...args) => attachUploadedImage(...args),
}));

const FRANCHISE = { system_id: "f1", franchise_name_en: "Test Franchise" };

function mockFetch(animeResponse) {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u.startsWith("/api/franchise/") && method === "GET") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([FRANCHISE]),
      });
    }
    if (u === "/api/anime/" && method === "POST") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(animeResponse),
      });
    }
    // Every other GET the initial page load fires (franchise/series/sources/
    // form-defaults/etc.) and every other side-effect POST (credits, cast,
    // enrich) is irrelevant to this flow.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
  });
}

beforeEach(() => {
  showToast.mockReset();
  attachUploadedImage.mockReset();
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Add />
    </QueryClientProvider>,
  );
}

// Anime is the default tab, so there is no group/tab click - just wait for
// the initial page load (which fetches allFranchises, among other things).
async function fillAnimeForm(user) {
  await waitFor(() =>
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
  );
  await user.type(
    screen.getByPlaceholderText("English title"),
    "Test Anime",
  );
  await user.click(
    screen.getByPlaceholderText("Search or type new franchise..."),
  );
  await user.click(screen.getByRole("button", { name: "Test Franchise" }));
}

describe("Add page — Anime tab image attach", () => {
  it("attaches the pending image once the entry is saved", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ system_id: "anime-1", anime_name_en: "Test Anime" }),
    );
    attachUploadedImage.mockResolvedValue({});
    const user = userEvent.setup();

    mount();
    await fillAnimeForm(user);
    await user.click(
      screen.getByRole("button", { name: /simulate image pick/i }),
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(attachUploadedImage).toHaveBeenCalledWith(
        "img-1",
        "anime",
        "anime-1",
        "cover",
      ),
    );
    expect(showToast).not.toHaveBeenCalledWith("error", expect.anything());

    vi.unstubAllGlobals();
  });

  it("surfaces a failed post-save attach instead of dropping it", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ system_id: "anime-2", anime_name_en: "Test Anime" }),
    );
    attachUploadedImage.mockRejectedValue(new Error("Unknown owner type"));
    const user = userEvent.setup();

    mount();
    await fillAnimeForm(user);
    await user.click(
      screen.getByRole("button", { name: /simulate image pick/i }),
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("error", "Unknown owner type"),
    );
    // The entry itself still saved - a failed attach must not be reported
    // as a failed save.
    expect(showToast).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("Entry appended"),
    );

    vi.unstubAllGlobals();
  });
});
