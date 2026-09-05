// Novel detail page: renders novel_units (Task 8/9's `units` relationship)
// instead of the retired novel_name_each_cn/_en parallel lists, using each
// unit's server-computed display_key.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Novel from "./Novel";

const BASE_NOVEL = {
  system_id: "n1",
  novel_name_cn: "測試小說",
  novel_name_en: "Test Novel",
  novel_name_roman: null,
  novel_name_jp: null,
  novel_name_alt: null,
  franchise_id: null,
  series_id: null,
  region: "JP",
  type: "Web",
  serialization_status: "連載中",
  reading_status: "Reading",
  progress_display: null,
  vol_total_original: null,
  vol_total_tw: null,
  vol_fin: 0,
  arc_total: null,
  arc_fin: 0,
  ch_total: null,
  ch_fin: 0,
  my_rating: null,
  cover_image_file: null,
  remark: null,
  units: [],
};

function respond(url, isAdmin) {
  const u = String(url);
  if (u.startsWith("/api/auth/me")) {
    return {
      is_admin: isAdmin,
      username: isAdmin ? "admin" : null,
      role: isAdmin ? "admin" : "guest",
      is_superuser: isAdmin,
      permissions: [],
    };
  }
  return [];
}

function mockFetch(novel, { isAdmin = false, onPatch } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      const u = String(url);
      if (u.startsWith("/api/novel/n1")) {
        if (options?.method === "PATCH") {
          const body = JSON.parse(options.body);
          onPatch?.(body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ...novel, ...body }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(novel),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(u, isAdmin)),
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/novel/n1"]}>
            <Routes>
              <Route path="/novel/:system_id" element={<Novel />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Novel detail page — units", () => {
  it("renders a unit's server-provided display_key even with no key or name", async () => {
    mockFetch({
      ...BASE_NOVEL,
      units: [
        {
          system_id: "u1",
          unit_kind: "arc",
          position: 1,
          unit_key: null,
          name_cn: null,
          name_en: null,
          remark: null,
          ch_count: 100,
          display_key: "Arc 1",
        },
      ],
    });
    mount();
    expect(await screen.findByText("Arc 1")).toBeInTheDocument();
    expect(screen.getByText("100 ch")).toBeInTheDocument();
  });

  it("renders a named unit's key alongside its title and remark", async () => {
    mockFetch({
      ...BASE_NOVEL,
      type: "Light Novel",
      units: [
        {
          system_id: "u1",
          unit_kind: "volume",
          position: 1,
          unit_key: "Vol.1",
          name_cn: "第一卷",
          name_en: "Volume One",
          remark: "Limited edition",
          ch_count: null,
          display_key: "Vol.1",
        },
      ],
    });
    mount();
    expect(await screen.findByText("Vol.1")).toBeInTheDocument();
    expect(screen.getByText("第一卷 / Volume One")).toBeInTheDocument();
    expect(screen.getByText("Limited edition")).toBeInTheDocument();
  });

  it("does not render an empty Units card for a novel with no units", async () => {
    mockFetch({ ...BASE_NOVEL, units: [] });
    mount();
    // Wait for the page to finish loading before asserting an absence.
    await screen.findByRole("heading", { name: "Test Novel" });
    expect(screen.queryByText("Units")).not.toBeInTheDocument();
  });

  it('labels the original-volumes total "JP/KR"', async () => {
    mockFetch({ ...BASE_NOVEL, vol_total_original: 5 });
    mount();
    await waitFor(() =>
      expect(screen.getByText("Total Volumes (JP/KR)")).toBeInTheDocument(),
    );
  });

  it("admin editing a unit and saving PATCHes the full units array and applies the server response", async () => {
    let patchedBody = null;
    mockFetch(
      {
        ...BASE_NOVEL,
        type: "Light Novel",
        units: [
          {
            system_id: "u1",
            unit_kind: "volume",
            position: 1,
            unit_key: "Vol.1",
            name_cn: "第一卷",
            name_en: "Volume One",
            remark: "",
            ch_count: null,
            display_key: "Vol.1",
          },
        ],
      },
      { isAdmin: true, onPatch: (body) => (patchedBody = body) },
    );
    const user = userEvent.setup();
    mount();

    const remarkInput = await screen.findByPlaceholderText("Remark");
    await user.type(remarkInput, "Limited edition");

    const saveButton = await screen.findByRole("button", { name: "Save" });
    await user.click(saveButton);

    await waitFor(() => expect(patchedBody).not.toBeNull());
    expect(patchedBody.units).toHaveLength(1);
    expect(patchedBody.units[0]).toMatchObject({
      system_id: "u1",
      remark: "Limited edition",
    });

    // The Save/Cancel controls disappear once the edit round-trips —
    // proof the page applied the server's response rather than the toast
    // firing over an edit that never left the client (Finding 1).
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument(),
    );
  });
});

describe("Novel detail page — sources", () => {
  it("renders the Open Library link in the Sources card", async () => {
    mockFetch({
      ...BASE_NOVEL,
      openlibrary_link: "https://openlibrary.org/works/OL5738148W",
    });
    mount();
    expect(await screen.findByText("Open Library")).toBeInTheDocument();
  });

  it("renders no Open Library row when the link is absent", async () => {
    mockFetch({ ...BASE_NOVEL, openlibrary_link: null });
    mount();
    await screen.findByRole("heading", { name: "Test Novel" });
    expect(screen.queryByText("Open Library")).not.toBeInTheDocument();
  });
});
