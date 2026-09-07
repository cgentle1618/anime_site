// Regression coverage for Finding 2 (novel-units final review): MediaCard's
// novel progress branch must agree with getNovelProgress / NovelDashboardCard
// on which pair a novel renders, via the shared effectiveProgressDisplay
// helper (frontend/src/lib/novelUnits.js), rather than branching on the raw
// progress_display column directly.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import MediaCard from "./MediaCard";

function mockAuthFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            is_admin: false,
            username: null,
            role: "guest",
            is_superuser: false,
            permissions: [],
          }),
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount(data, type = "novel") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <MediaCard type={type} data={data} isAdmin={false} />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("MediaCard — novel progress (Decision G)", () => {
  it("a Web novel with arc rows and no stored progress_display renders the two-stage position, not a volume counter", async () => {
    mockAuthFetch();
    mount({
      system_id: "n1",
      type: "Web",
      progress_display: "",
      novel_name_en: "Test Novel",
      reading_status: "Reading",
      arc_fin: 1,
      arc_total: 2,
      ch_fin_in_arc: 101,
      ch_total: 212,
      ch_fin: 201,
      vol_fin: 0,
      vol_total_original: null,
      units: [
        { unit_kind: "arc", position: 1, ch_count: 100 },
        { unit_kind: "arc", position: 2, ch_count: 112 },
      ],
    });

    expect(await screen.findByText("arc 2 · 101/112 CH")).toBeInTheDocument();
  });
});


// The Bahamut badge must come from the one shared predicate in
// lib/formatters.js (kind "access" AND bucket "main"), not from a name match
// re-implemented here - a typed free-form row named "Bahamut" is somebody's
// note, not the platform.
describe("MediaCard - the Bahamut badge", () => {
  const base = {
    system_id: "a1",
    anime_name_en: "Test Anime",
    watching_status: "Active Watching",
  };

  it("shows for a main access row marked available", async () => {
    mockAuthFetch();
    mount(
      {
        ...base,
        sources: [
          { kind: "access", bucket: "main", name: "Bahamut", available: true },
        ],
      },
      "anime",
    );
    expect(await screen.findByAltText("Baha")).toBeInTheDocument();
  });

  it("does not show for a free-form row typed 'Bahamut'", async () => {
    mockAuthFetch();
    mount(
      {
        ...base,
        sources: [
          { kind: "access", bucket: "other", name: "Bahamut", available: true },
        ],
      },
      "anime",
    );
    await screen.findByText("Test Anime");
    expect(screen.queryByAltText("Baha")).toBeNull();
  });
});
