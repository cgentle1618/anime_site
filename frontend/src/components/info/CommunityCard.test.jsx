// What the public lists think of one entry.
//
// The sample size is the thing this component must never drop: an average of
// "A" over two ratings and an average of "A" over two hundred are different
// claims, and only one of them is worth reading.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CommunityCard from "./CommunityCard";

const MEDIA_ID = "11111111-1111-1111-1111-111111111111";

function stub(body) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CommunityCard mediaId={MEDIA_ID} />
    </QueryClientProvider>,
  );
}

describe("CommunityCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when no public list holds the entry", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 0,
      statuses: [],
      sample_size: 0,
      average_points: null,
      average_rating: null,
    });
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a payload that is not an aggregate", async () => {
    // Nine detail pages mount this card, and a page whose stubbed fetch answers
    // something else must not be taken down by it.
    stub({ anime_name_en: "Something else entirely" });
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the per-status counts", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 3,
      statuses: [
        { status: "Completed", count: 2 },
        { status: "Watching", count: 1 },
      ],
      sample_size: 2,
      average_points: 7.0,
      average_rating: "A+",
    });
    renderCard();
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Watching")).toBeInTheDocument();
  });

  it("shows the average beside its sample size", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 3,
      statuses: [{ status: "Completed", count: 2 }],
      sample_size: 2,
      average_points: 7.0,
      average_rating: "A+",
    });
    renderCard();
    expect(await screen.findByText("A+")).toBeInTheDocument();
    expect(screen.getByText(/2 ratings/)).toBeInTheDocument();
  });

  it("omits the average when nobody rated it", async () => {
    stub({
      media_id: MEDIA_ID,
      list_count: 2,
      statuses: [{ status: "Watching", count: 2 }],
      sample_size: 0,
      average_points: null,
      average_rating: null,
    });
    renderCard();
    expect(await screen.findByText("Watching")).toBeInTheDocument();
    expect(screen.queryByText(/ratings/)).not.toBeInTheDocument();
  });
});
