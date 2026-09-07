// The Alias tab shared by the admin Add and Modify pages.
//
// The thing worth testing here is not the picker (AliasPicker.test.jsx covers
// that) but the save: an alias row has no endpoint of its own, so editing one
// is a PUT of the WHOLE option. Sending a partial body would silently drop the
// option's scopes and usages, which is exactly the bug this tab exists beside.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AliasTab from "./AliasTab";

const OPTIONS = [
  {
    system_id: "opt-1",
    category: "Game Genre",
    value: "角色扮演",
    sort_order: 3,
    remark: "seeded",
    scopes: ["game"],
    usages: [],
    aliases: [{ source: "igdb", value: "Role-playing (RPG)" }],
  },
  {
    system_id: "opt-2",
    category: "Game Genre",
    value: "射擊",
    sort_order: 4,
    remark: null,
    scopes: ["game"],
    usages: [],
    aliases: [],
  },
  {
    system_id: "opt-3",
    category: "Game Theme",
    value: "奇幻",
    sort_order: 1,
    remark: null,
    scopes: ["game"],
    usages: [],
    aliases: [{ source: "igdb", value: "Fantasy" }],
  },
];

function renderTab(props = {}) {
  const onSaved = vi.fn();
  render(<AliasTab options={OPTIONS} onSaved={onSaved} {...props} />);
  return onSaved;
}

function selectOption(category, value) {
  fireEvent.change(screen.getByLabelText(/category/i), {
    target: { value: category },
  });
  fireEvent.change(screen.getByLabelText(/^option value/i), {
    target: { value },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...OPTIONS[0], aliases: [] }),
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AliasTab", () => {
  it("narrows the value list to the chosen category", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Game Theme" },
    });
    const values = screen.getByLabelText(/^option value/i);
    expect(within(values).queryByText("奇幻")).toBeTruthy();
    expect(within(values).queryByText("角色扮演")).toBeFalsy();
  });

  it("seeds the picker from the chosen option's existing aliases", () => {
    renderTab();
    selectOption("Game Genre", "opt-1");
    expect(screen.getByDisplayValue("Role-playing (RPG)")).toBeInTheDocument();
  });

  it("re-seeds when the chosen option changes", () => {
    // Leaving the previous option's rows on screen would let an admin save
    // 角色扮演's aliases onto 射擊 without noticing.
    renderTab();
    selectOption("Game Genre", "opt-1");
    expect(screen.getByDisplayValue("Role-playing (RPG)")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^option value/i), {
      target: { value: "opt-2" },
    });
    expect(screen.queryByDisplayValue("Role-playing (RPG)")).toBeNull();
  });

  it("PUTs the whole option, not just its aliases", async () => {
    const onSaved = renderTab();
    selectOption("Game Genre", "opt-1");
    fireEvent.change(screen.getByLabelText(/alias 1 external value/i), {
      target: { value: "RPG" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save alias/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls.at(-1);
    expect(url).toContain("opt-1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      category: "Game Genre",
      value: "角色扮演",
      sort_order: 3,
      remark: "seeded",
      scopes: ["game"],
      usages: [],
      aliases: [{ source: "igdb", value: "RPG" }],
    });
  });

  it("offers only the categories that may carry aliases", () => {
    // Game Theme and Game Genre qualify; a category the pipelines never ask
    // about must not be reachable here, because the API would 422 the save.
    render(
      <AliasTab
        options={[
          ...OPTIONS,
          {
            system_id: "opt-4",
            category: "Genre Main",
            value: "懸疑",
            scopes: [],
            usages: [],
            aliases: [],
          },
        ]}
        onSaved={vi.fn()}
      />,
    );
    const select = screen.getByLabelText(/category/i);
    expect(within(select).queryByText("Game Genre")).toBeTruthy();
    expect(within(select).queryByText("Genre Main")).toBeFalsy();
  });

  it("cannot save before an option is chosen", () => {
    renderTab();
    expect(screen.getByRole("button", { name: /save alias/i })).toBeDisabled();
  });
});
