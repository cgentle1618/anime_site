import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PersonLibrary from "./PersonLibrary";

const PEOPLE = [
  {
    system_id: "1",
    name_en: "Jon Favreau",
    display_name: "Jon Favreau",
    credit_count: 3,
    roles: [{ role: "director", scope: "movie" }],
  },
  {
    system_id: "2",
    name_cn: "渡部高志",
    display_name: "渡部高志",
    credit_count: 8,
    roles: [{ role: "director", scope: "anime" }],
  },
  {
    system_id: "3",
    name_jp: "諫山創",
    display_name: "諫山創",
    credit_count: 1,
    roles: [{ role: "author", scope: "manga" }],
  },
  {
    system_id: "4",
    name_alt: "Pen Name",
    display_name: "Pen Name",
    credit_count: 0,
    roles: [],
  },
];

const SEIYUU = [
  {
    system_id: "5",
    name_en: "Miyu Irino",
    display_name: "Miyu Irino",
    credit_count: 0,
    roles: [{ role: "seiyuu", scope: "anime" }],
  },
];

function renderLibrary(props) {
  return render(
    <MemoryRouter>
      <PersonLibrary {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(PEOPLE) }),
    ),
  );
});

describe("PersonLibrary", () => {
  it("searches across all four name fields", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );

    const box = screen.getByRole("searchbox");
    for (const [term, kept] of [
      ["Favreau", "Jon Favreau"],
      ["渡部", "渡部高志"],
      ["諫山", "諫山創"],
      ["Pen", "Pen Name"],
    ]) {
      await user.clear(box);
      await user.type(box, term);
      await waitFor(() => expect(screen.getByText(kept)).toBeInTheDocument());
      expect(screen.queryAllByRole("link")).toHaveLength(1);
    }
  });

  it("sorts by credit count", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("渡部高志")).toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByLabelText(/sort/i), "credit_count");
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards[0]).toContain("渡部高志");
  });

  it("filters by person type", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await waitFor(() =>
      expect(screen.getByText("Jon Favreau")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Author" }));
    const cards = screen.getAllByRole("link").map((a) => a.textContent);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toContain("諫山創");
  });

  it("filters to seiyuu when rendered with role=\"seiyuu\"", async () => {
    renderLibrary({ role: "seiyuu" });

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/person/?role=seiyuu");
  });

  it("does not filter /library/person when role is unset", async () => {
    renderLibrary();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("/api/person/");
  });

  it("lists a seiyuu who has never been cast", async () => {
    fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(SEIYUU) }),
    );

    renderLibrary({ role: "seiyuu" });

    await waitFor(() =>
      expect(screen.getByText("Miyu Irino")).toBeInTheDocument(),
    );
    expect(screen.getByText("0 credits")).toBeInTheDocument();
  });
});
