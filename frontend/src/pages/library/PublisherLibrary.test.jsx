import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublisherLibrary from "./PublisherLibrary";

const PUBLISHERS = [
  {
    system_id: "1",
    name_en: "Bandai Namco",
    display_name: "Bandai Namco",
    credit_count: 12,
  },
  {
    system_id: "2",
    name_en: "Muse Communication",
    name_cn: "木棉花",
    display_name_field: "cn",
    display_name: "木棉花",
    credit_count: 30,
  },
];

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(PUBLISHERS) }),
  );
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PublisherLibrary />
    </MemoryRouter>,
  );
}

describe("PublisherLibrary", () => {
  it("lists every publisher by its display name", async () => {
    renderPage();
    expect(await screen.findByText("木棉花")).toBeInTheDocument();
    expect(screen.getByText("Bandai Namco")).toBeInTheDocument();
  });

  it("searches across every name field, not just the displayed one", async () => {
    renderPage();
    await screen.findByText("木棉花");
    await userEvent.type(screen.getByRole("searchbox"), "Muse Communication");
    await waitFor(() => {
      expect(screen.getByText("木棉花")).toBeInTheDocument();
      expect(screen.queryByText("Bandai Namco")).not.toBeInTheDocument();
    });
  });

  it("links each publisher to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /木棉花/ })).toHaveAttribute(
      "href",
      "/publisher/2",
    );
  });
});
