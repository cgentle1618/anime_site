// Frontend: the "Choose from library" modal's filters and paging.
//
// Covers what a 2000-image library needs from the picker that the plain
// unfiltered `limit: 60` call never offered: a sensible default (Unused,
// newest first, since useImages already orders that way), refetching on a
// filter change, paging past the first page, and search reaching the
// filename field.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ImagePicker from "./ImagePicker";

function image(id, overrides = {}) {
  return {
    system_id: id,
    storage_key: `library/${id}.jpg`,
    thumb_key: null,
    original_filename: `${id}.jpg`,
    attachments: [],
    missing: false,
    ...overrides,
  };
}

function mockFetch(responder) {
  const fetchMock = vi.fn((url) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(responder(url)),
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPicker() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ImagePicker
        ownerType="anime"
        ownerId="11111111-1111-1111-1111-111111111111"
        role="cover"
        value={null}
        onChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

async function openLibrary() {
  await userEvent.click(
    screen.getByRole("button", { name: /choose from library/i }),
  );
}

function lastImagesUrl(fetchMock) {
  const calls = fetchMock.mock.calls.filter(([url]) =>
    url.startsWith("/api/images"),
  );
  return calls[calls.length - 1][0];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ImagePicker library modal - defaults", () => {
  it("opens filtered to Unused, so the first request asks for unused=true", async () => {
    const fetchMock = mockFetch(() => ({ images: [image("a")], total: 1 }));
    renderPicker();
    await openLibrary();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = lastImagesUrl(fetchMock);
    expect(url).toContain("unused=true");

    const unusedChip = screen.getByRole("button", { name: /^unused$/i });
    expect(unusedChip).toHaveAttribute("aria-pressed", "true");
  });

  it("clearing Unused re-fetches without it and reveals everything", async () => {
    const fetchMock = mockFetch(() => ({ images: [image("a")], total: 1 }));
    renderPicker();
    await openLibrary();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fetchMock.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /^unused$/i }));

    await waitFor(() => {
      const url = lastImagesUrl(fetchMock);
      expect(url).not.toContain("unused=true");
    });
  });
});

describe("ImagePicker library modal - filter changes refetch", () => {
  it("picking an owner type (after clearing Unused) sends owner_type", async () => {
    const fetchMock = mockFetch(() => ({ images: [], total: 0 }));
    renderPicker();
    await openLibrary();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: /^unused$/i }));
    fetchMock.mockClear();

    fireEvent.change(screen.getByLabelText(/used on/i), {
      target: { value: "quote" },
    });

    await waitFor(() => {
      const url = lastImagesUrl(fetchMock);
      expect(url).toContain("owner_type=quote");
    });
  });

  it("does not send owner_type while Unused is active, and disables the select", async () => {
    const fetchMock = mockFetch(() => ({ images: [], total: 0 }));
    renderPicker();
    await openLibrary();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.getByLabelText(/used on/i)).toBeDisabled();
    const url = lastImagesUrl(fetchMock);
    expect(url).not.toContain("owner_type");
  });

  it("toggling Not on this machine sends missing=true", async () => {
    const fetchMock = mockFetch(() => ({ images: [], total: 0 }));
    renderPicker();
    await openLibrary();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fetchMock.mockClear();
    await userEvent.click(
      screen.getByRole("button", { name: /not on this machine/i }),
    );

    await waitFor(() => {
      const url = lastImagesUrl(fetchMock);
      expect(url).toContain("missing=true");
    });
  });
});

describe("ImagePicker library modal - paging", () => {
  it("pages past the first 60 with Next, using offset=60", async () => {
    const fetchMock = mockFetch(() => ({
      images: [image("a")],
      total: 120,
    }));
    renderPicker();
    await openLibrary();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fetchMock.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /^next$/i }));

    await waitFor(() => {
      const url = lastImagesUrl(fetchMock);
      expect(url).toContain("offset=60");
      expect(url).toContain("limit=60");
    });
  });
});

describe("ImagePicker library modal - search", () => {
  it("typing in the filename search reaches the backend as q, debounced", async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes("q=cover")) {
        return { images: [image("cover-shot")], total: 1 };
      }
      return { images: [image("a")], total: 1 };
    });
    renderPicker();
    await openLibrary();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const search = screen.getByLabelText(/search filename/i);
    fireEvent.change(search, { target: { value: "cover" } });

    // Not yet - the debounce has not elapsed.
    expect(lastImagesUrl(fetchMock)).not.toContain("q=cover");

    await waitFor(
      () => {
        expect(lastImagesUrl(fetchMock)).toContain("q=cover");
      },
      { timeout: 2000 },
    );
  });
});
