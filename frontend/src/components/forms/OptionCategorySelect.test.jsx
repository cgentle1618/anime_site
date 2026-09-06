// The category picker shared by the Add, Modify and Delete pages. Guards the
// two things that separate it from a plain <select>: the categories arrive
// arranged into the same sections the /options page reads them in, and a list
// that yields only one section is rendered flat rather than under a heading
// that repeats the sub-tab's own name.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OptionCategorySelect from "./OptionCategorySelect";

// The optgroup labels in render order.
function groupLabels(container) {
  return [...container.querySelectorAll("optgroup")].map((g) => g.label);
}

// The option values under one optgroup, in render order.
function groupOptions(container, label) {
  const group = [...container.querySelectorAll("optgroup")].find(
    (g) => g.label === label,
  );
  return [...group.querySelectorAll("option")].map((o) => o.value);
}

describe("OptionCategorySelect", () => {
  it("arranges the categories into sections in group order", () => {
    const { container } = render(
      <OptionCategorySelect
        categories={[
          "Comic Era",
          "Game Genre",
          "Comic Imprint",
          "Game Theme",
          "Platform",
          "Reference Source",
        ]}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(groupLabels(container)).toEqual([
      "Game",
      "Comic",
      "Source & Platform",
    ]);
    expect(groupOptions(container, "Game")).toEqual(["Game Genre", "Game Theme"]);
  });

  it("files categories no group claims under Other", () => {
    const { container } = render(
      <OptionCategorySelect
        categories={["Game Genre", "Game Theme", "Zebra", "Aardvark"]}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(groupLabels(container)).toEqual(["Game", "Other"]);
    expect(groupOptions(container, "Other")).toEqual(["Aardvark", "Zebra"]);
  });

  it("renders one section flat, with no heading over the whole list", () => {
    const { container } = render(
      <OptionCategorySelect
        categories={["Genre Main", "Genre Sub", "Label", "Quality"]}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelectorAll("optgroup")).toHaveLength(0);
    expect(
      [...container.querySelectorAll("option")].map((o) => o.value),
    ).toEqual(["", "Genre Main", "Genre Sub", "Label", "Quality"]);
  });

  it("offers a blank placeholder row and reports the picked category", () => {
    // Read the value inside the handler: the select is controlled, so React
    // puts the DOM node back to `value` before the assertion runs.
    let picked = null;
    const onChange = vi.fn((e) => {
      picked = e.target.value;
    });
    render(
      <OptionCategorySelect
        categories={["Game Genre", "Game Theme"]}
        value=""
        onChange={onChange}
        placeholder="— Select Category —"
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("option", { name: "— Select Category —" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Game Theme" },
    });
    expect(picked).toBe("Game Theme");
  });

  it("survives an empty category list", () => {
    const { container } = render(
      <OptionCategorySelect categories={[]} value="" onChange={vi.fn()} />,
    );
    expect(container.querySelectorAll("option")).toHaveLength(1);
  });
});
