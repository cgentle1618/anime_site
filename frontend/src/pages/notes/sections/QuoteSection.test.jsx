// Frontend: a new quote has no id until it is created, so an image picked
// during the draft could not be attached at pick time (ImagePicker skips
// attach with no ownerId - see components/forms/ImagePicker.jsx). This test
// guards the fix for that: once the quote is created, the section must
// attach the image itself, using the new quote's id. Before the fix, nothing
// ever attached and /images could delete a file a saved quote still pointed
// at.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QuoteSection from "./QuoteSection";

const showToast = vi.fn();
vi.mock("../../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const attachUploadedImage = vi.fn();
// Mocking the module ImagePicker.jsx resolves to (shared by QuoteForm and
// this section) - a stub button stands in for the real upload widget so the
// test exercises the section's save flow, not file inputs and FormData.
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
}));

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuoteSection
        label="Quotes"
        mediaType="anime"
        entryId="entry-1"
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

describe("QuoteSection", () => {
  it("attaches an image picked before save, once the quote is created", async () => {
    const user = userEvent.setup();
    fetchJson.mockImplementation((url, options) => {
      if (url.includes("/api/quote") && options?.method === "POST") {
        return Promise.resolve({ system_id: "quote-1" });
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
        "quote",
        "quote-1",
        "quote",
      ),
    );
    expect(showToast).not.toHaveBeenCalledWith(
      "error",
      expect.anything(),
    );
  });

  it("does not attach when no image was picked", async () => {
    const user = userEvent.setup();
    fetchJson.mockImplementation((url, options) => {
      if (url.includes("/api/quote") && options?.method === "POST") {
        return Promise.resolve({ system_id: "quote-2" });
      }
      return Promise.resolve([]);
    });

    renderSection();

    await user.click(screen.getByRole("button", { name: "Add" }));
    // Give the draft some text so commit() does not bail out early.
    const textarea = screen.getByPlaceholderText("The line itself");
    await user.type(textarea, "Hello there.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchJson).toHaveBeenCalled());
    expect(attachUploadedImage).not.toHaveBeenCalled();
  });
});
