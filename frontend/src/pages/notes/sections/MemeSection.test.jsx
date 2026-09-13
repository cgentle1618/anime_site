// Frontend: same defect as QuoteSection.test.jsx, for memes - a new meme has
// no id until it is created, so an image picked during the draft could not be
// attached at pick time. This guards that the section attaches it itself once
// the meme is created.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MemeSection from "./MemeSection";

const showToast = vi.fn();
vi.mock("../../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const attachUploadedImage = vi.fn();
vi.mock("../../../components/forms/ImagePicker", () => ({
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

const fetchJson = vi.fn();
vi.mock("../../../api/client", () => ({
  fetchJson: (...args) => fetchJson(...args),
  jsonBody: (body) => ({ body: JSON.stringify(body) }),
  buildUrl: (url) => url,
}));

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemeSection
        label="Memes"
        ownerType="anime"
        ownerId="entry-1"
        isAdmin
        onCount={() => {}}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchJson.mockReset();
  attachUploadedImage.mockReset();
  showToast.mockReset();
});

describe("MemeSection", () => {
  it("attaches an image picked before save, once the meme is created", async () => {
    const user = userEvent.setup();
    fetchJson.mockImplementation((url, options) => {
      if (url.includes("/api/meme") && options?.method === "POST") {
        return Promise.resolve({ system_id: "meme-1" });
      }
      return Promise.resolve([]);
    });
    attachUploadedImage.mockResolvedValue({});

    renderSection();

    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(
      screen.getByRole("button", { name: /simulate image pick/i }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(attachUploadedImage).toHaveBeenCalledWith(
        "img-1",
        "meme",
        "meme-1",
        "cover",
      ),
    );
    expect(showToast).not.toHaveBeenCalledWith("error", expect.anything());
  });
});
