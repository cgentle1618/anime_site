// The alias rows attached to one system option. Guards the three things that
// separate an alias from a scope or a usage: rows are pairs rather than flags,
// a blank external value is dropped on save, and an empty list means "nothing
// maps to this", not "everything does".
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AliasPicker, {
  ALIAS_CATEGORIES,
  categoryHasAliases,
  cleanAliases,
  optionWithoutAlias,
} from "./AliasPicker";

function renderPicker(aliases = [], setAliases = vi.fn()) {
  render(<AliasPicker aliases={aliases} setAliases={setAliases} />);
  return setAliases;
}

// setAliases is called with an updater, the way the useState setters in
// Add.jsx and Modify.jsx are. Apply it to get the next value.
function nextValue(setAliases, prev) {
  const updater = setAliases.mock.calls.at(-1)[0];
  return typeof updater === "function" ? updater(prev) : updater;
}

describe("AliasPicker", () => {
  it("shows a row per alias, source and external value both editable", () => {
    renderPicker([{ source: "igdb", value: "Role-playing (RPG)" }]);
    expect(screen.getByDisplayValue("Role-playing (RPG)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("igdb")).toBeInTheDocument();
  });

  it("adds a row defaulted to the first known source", () => {
    const setAliases = renderPicker([]);
    fireEvent.click(screen.getByRole("button", { name: /add alias/i }));
    expect(nextValue(setAliases, [])).toEqual([{ source: "igdb", value: "" }]);
  });

  it("edits the external value of one row without touching its neighbour", () => {
    const prev = [
      { source: "igdb", value: "Shooter" },
      { source: "igdb", value: "Platform" },
    ];
    const setAliases = renderPicker(prev);
    fireEvent.change(screen.getByDisplayValue("Platform"), {
      target: { value: "Platformer" },
    });
    expect(nextValue(setAliases, prev)).toEqual([
      { source: "igdb", value: "Shooter" },
      { source: "igdb", value: "Platformer" },
    ]);
  });

  it("removes a row by its index, not by its value", () => {
    // Two rows can hold the same text mid-edit; removing by value would take
    // both. The remove buttons are named after the row's position.
    const prev = [
      { source: "igdb", value: "Sport" },
      { source: "igdb", value: "Sport" },
    ];
    const setAliases = renderPicker(prev);
    fireEvent.click(screen.getByRole("button", { name: /remove alias 1/i }));
    expect(nextValue(setAliases, prev)).toEqual([
      { source: "igdb", value: "Sport" },
    ]);
  });

  it("says an empty list maps nothing, rather than everything", () => {
    // The opposite of ScopePicker and UsagePicker, whose empty state is
    // permissive. Getting this backwards is the whole reason for the hint.
    renderPicker([]);
    expect(screen.getByText(/no alias/i)).toBeInTheDocument();
  });
});

describe("categoryHasAliases", () => {
  it("admits only the three categories a pipeline reads", () => {
    // Opening a fourth means teaching a pipeline to read it, so this list is
    // code. If it changes, ALIAS_CATEGORIES in app/utils/source_fields.py
    // must change with it — the API rejects anything else with a 422.
    expect(ALIAS_CATEGORIES).toEqual([
      "Game Genre",
      "Game Theme",
      "Game Mode",
      "Game Platform",
    ]);
    expect(categoryHasAliases("Game Genre")).toBe(true);
    expect(categoryHasAliases("Game Platform")).toBe(true);
    expect(categoryHasAliases("Genre Main")).toBe(false);
  });

  it("excludes Combat Mode, which IGDB does not model", () => {
    // PvE/PvP is a hand-made classification with no IGDB field behind it, so
    // it is the one game category that carries no aliases.
    expect(categoryHasAliases("Combat Mode")).toBe(false);
  });
});

describe("cleanAliases", () => {
  it("drops rows whose external value is blank", () => {
    // The Add Alias button seeds an empty row; saving without filling it in
    // must not send it. The backend rejects nothing here - it would store an
    // alias for the empty string, which can never match.
    expect(
      cleanAliases([
        { source: "igdb", value: "Shooter" },
        { source: "igdb", value: "   " },
      ]),
    ).toEqual([{ source: "igdb", value: "Shooter" }]);
  });

  it("trims the external value", () => {
    expect(cleanAliases([{ source: "igdb", value: " Shooter " }])).toEqual([
      { source: "igdb", value: "Shooter" },
    ]);
  });

  it("drops a repeated source and value pair", () => {
    // uq_system_option_alias would reject the save. The backend validator
    // dedupes too; doing it here keeps the row count the admin sees honest.
    expect(
      cleanAliases([
        { source: "igdb", value: "Shooter" },
        { source: "igdb", value: "Shooter" },
      ]),
    ).toEqual([{ source: "igdb", value: "Shooter" }]);
  });
});

describe("optionWithoutAlias", () => {
  const option = {
    system_id: "opt-1",
    category: "Game Platform",
    value: "PlayStation",
    sort_order: 2,
    remark: "seeded",
    scopes: ["game"],
    usages: [],
    aliases: [
      { source: "igdb", value: "PlayStation 4" },
      { source: "igdb", value: "PlayStation 5" },
    ],
  };

  it("drops the named row and keeps the rest", () => {
    expect(
      optionWithoutAlias(option, "igdb", "PlayStation 4").aliases,
    ).toEqual([{ source: "igdb", value: "PlayStation 5" }]);
  });

  it("sends the option's scopes and usages back unchanged", () => {
    // The PUT replaces those lists wholesale. Omitting them here would
    // unscope the value and drop it out of every dropdown - a far bigger
    // change than the alias the admin asked to remove.
    const body = optionWithoutAlias(option, "igdb", "PlayStation 4");
    expect(body.scopes).toEqual(["game"]);
    expect(body.usages).toEqual([]);
    expect(body.category).toBe("Game Platform");
    expect(body.value).toBe("PlayStation");
    expect(body.sort_order).toBe(2);
    expect(body.remark).toBe("seeded");
  });

  it("matches on the source and value pair, not the value alone", () => {
    // Two sources may know a value by the same string once a second API
    // lands; removing "PlayStation 4" from igdb must not touch steam's.
    const twoSources = {
      ...option,
      aliases: [
        { source: "igdb", value: "PlayStation 4" },
        { source: "steam", value: "PlayStation 4" },
      ],
    };
    expect(optionWithoutAlias(twoSources, "igdb", "PlayStation 4").aliases).toEqual(
      [{ source: "steam", value: "PlayStation 4" }],
    );
  });

  it("leaves the list alone when nothing matches", () => {
    expect(optionWithoutAlias(option, "igdb", "Xbox").aliases).toHaveLength(2);
  });
});
