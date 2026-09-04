import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudioLibrary from "./StudioLibrary";

const STUDIOS = [
  { system_id: "1", name_en: "MAPPA", display_name: "MAPPA", credit_count: 12 },
  { system_id: "2", name_en: "Kyoto Animation", name_alt: "KyoAni",
    display_name_field: "alt", display_name: "KyoAni", credit_count: 30 },
  { system_id: "3", name_jp: "京都アニメーション", display_name: "京都アニメーション",
    credit_count: 1 },
];

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(STUDIOS) }),
  );
});

function renderPage() {
  return render(
    <MemoryRouter>
      <StudioLibrary />
    </MemoryRouter>,
  );
}

describe("StudioLibrary", () => {
  it("lists every studio by its display name", async () => {
    renderPage();
    expect(await screen.findByText("KyoAni")).toBeInTheDocument();
    expect(screen.getByText("MAPPA")).toBeInTheDocument();
  });

  it("searches across every name field, not just the displayed one", async () => {
    renderPage();
    await screen.findByText("KyoAni");
    await userEvent.type(screen.getByRole("searchbox"), "Kyoto Animation");
    await waitFor(() => {
      expect(screen.getByText("KyoAni")).toBeInTheDocument();
      expect(screen.queryByText("MAPPA")).not.toBeInTheDocument();
    });
  });

  it("links each studio to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /KyoAni/ })).toHaveAttribute(
      "href",
      "/studio/2",
    );
  });
});
