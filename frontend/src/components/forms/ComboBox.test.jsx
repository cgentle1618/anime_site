// ComboBox's selection contract: onSelect receives (id, label), not the item.
// Three pickers (MemeForm, MemeOwnerPicker, QuoteEntryPicker) read `item?.id`
// from the first argument and never stored a selection; this pins the shape
// every caller must follow.
import { fireEvent, render, screen } from "@testing-library/react";

import ComboBox from "./ComboBox";

const ITEMS = [
  { id: "q1", label: "Nothing is true" },
  { id: "q2", label: "Everything is permitted" },
];

it("calls onSelect with the id first and the label second", () => {
  const onSelect = vi.fn();
  render(<ComboBox items={ITEMS} onSelect={onSelect} placeholder="Search" />);

  fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "Every" } });
  fireEvent.click(screen.getByText("Everything is permitted"));

  expect(onSelect).toHaveBeenCalledWith("q2", "Everything is permitted");
});
