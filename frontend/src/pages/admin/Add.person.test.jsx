// Frontend: an Add tab has no row id until its entry is saved, so
// ImagePicker cannot attach the picked image at pick time - it hands the
// image id up as `pending_image_id` instead (see ImagePicker.jsx's module
// comment and config/formFactories.js). This test guards the Person tab's
// post-save attach: once the person is created, submitPerson() must attach
// the pending image itself, using the new person's id, and must surface a
// failure to attach rather than dropping it silently - a dropped attach
// would leave the upload orphaned and show as Unused on /images, where the
// unused-only Delete would remove a file the saved person still points at.
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

function mockFetch(personResponse) {
  return vi.fn((url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    if (u === "/api/person/" && method === "POST") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(personResponse),
      });
    }
    // Every other GET the initial page load fires (anime/franchise/series/
    // sources/form-defaults/role-scopes/etc.) is irrelevant to this flow.
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

async function goToPersonTab(user) {
  await waitFor(() =>
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Entity" }));
  await user.click(screen.getByRole("button", { name: "Person" }));
}

describe("Add page — Person tab image attach", () => {
  it("attaches the pending image once the person is saved", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ system_id: "person-1", display_name: "New Person" }),
    );
    attachUploadedImage.mockResolvedValue({});
    const user = userEvent.setup();

    mount();
    await goToPersonTab(user);

    const [nameInput] = screen.getAllByRole("textbox");
    await user.type(nameInput, "Ada Lovelace");
    await user.click(
      screen.getByRole("button", { name: /simulate image pick/i }),
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(attachUploadedImage).toHaveBeenCalledWith(
        "img-1",
        "staff",
        "person-1",
        "cover",
      ),
    );
    expect(showToast).not.toHaveBeenCalledWith("error", expect.anything());

    vi.unstubAllGlobals();
  });

  it("surfaces a failed post-save attach instead of dropping it", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ system_id: "person-2", display_name: "Grace Hopper" }),
    );
    attachUploadedImage.mockRejectedValue(new Error("Unknown owner type"));
    const user = userEvent.setup();

    mount();
    await goToPersonTab(user);

    const [nameInput] = screen.getAllByRole("textbox");
    await user.type(nameInput, "Grace Hopper");
    await user.click(
      screen.getByRole("button", { name: /simulate image pick/i }),
    );
    await user.click(screen.getByRole("button", { name: /append entry/i }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("error", "Unknown owner type"),
    );
    // The person itself still saved - a failed attach must not be reported
    // as a failed save.
    expect(showToast).toHaveBeenCalledWith(
      "success",
      "Person appended successfully.",
    );

    vi.unstubAllGlobals();
  });
});
