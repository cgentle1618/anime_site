// The Add page's System Options form. Guards the one thing that separates it
// from the Modify and Delete pickers: a category is chosen from the declared
// vocabulary, never typed, so the Add page can no longer invent one.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OptionsAddTab from "./OptionsAddTab";

const CATEGORIES = [
  "Comic Era",
  "Comic Imprint",
  "Game Genre",
  "Game Theme",
  "Genre Main",
  "Label",
];

function renderTab(optionsSubTab = "options", props = {}) {
  return render(
    <OptionsAddTab
      optionsSubTab={optionsSubTab}
      setOptionsSubTab={vi.fn()}
      optCategory=""
      setOptCategory={vi.fn()}
      optValues={[""]}
      setOptValues={vi.fn()}
      optionCategories={CATEGORIES}
      optScopes={[]}
      setOptScopes={vi.fn()}
      optUsages={[]}
      setOptUsages={vi.fn()}
      optAliases={[]}
      setOptAliases={vi.fn()}
      {...props}
    />,
  );
}

describe("OptionsAddTab", () => {
  it("offers the category as a closed picker, with no way to type a new one", () => {
    const { container } = renderTab();
    expect(container.querySelector("datalist")).toBeNull();
    // The value inputs are still text boxes; none of them takes a category.
    expect(
      [...container.querySelectorAll("input")].some((i) => i.getAttribute("list")),
    ).toBe(false);
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
  });

  it("groups the Options sub-tab's categories, tags excluded", () => {
    const { container } = renderTab("options");
    const labels = [...container.querySelectorAll("optgroup")].map((g) => g.label);
    expect(labels).toEqual(["Game", "Comic"]);
    const values = [...container.querySelectorAll("optgroup option")].map(
      (o) => o.value,
    );
    expect(values).not.toContain("Label");
    expect(values).not.toContain("Genre Main");
  });

  it("offers only the tag categories on the Tags sub-tab", () => {
    const { container } = renderTab("tags");
    const values = [...container.querySelectorAll("option")]
      .map((o) => o.value)
      .filter(Boolean);
    expect(values).toEqual(["Genre Main", "Label"]);
  });
});
