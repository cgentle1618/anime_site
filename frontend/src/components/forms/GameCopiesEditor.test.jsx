// Frontend: the copies editor is controlled, the way NovelUnitsEditor is.
//
// The contract these lock: the parent owns the array, every mutation goes out
// through onChange, the component never writes to the array it was handed,
// and `position` is renumbered 1..n after every structural change.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GameCopiesEditor from "./GameCopiesEditor";

const ROWS = [
  { storefront: "Steam", ownership: "Owned", copy_format: "Digital", position: 1 },
  { storefront: "GOG", ownership: "Wishlist", copy_format: "Digital", position: 2 },
];

describe("GameCopiesEditor", () => {
  it("is controlled: adding a row calls onChange and mutates nothing", async () => {
    const onChange = vi.fn();
    const items = [...ROWS];
    render(<GameCopiesEditor items={items} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /add copy/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(3);
    expect(items).toEqual(ROWS);
  });

  it("renumbers position after a removal", async () => {
    const onChange = vi.fn();
    render(<GameCopiesEditor items={ROWS} onChange={onChange} />);
    await userEvent.click(screen.getAllByRole("button", { name: /remove/i })[0]);
    expect(onChange.mock.calls[0][0].map((r) => r.position)).toEqual([1]);
  });

  it("edits a field in place", async () => {
    const onChange = vi.fn();
    render(<GameCopiesEditor items={ROWS} onChange={onChange} />);
    await userEvent.selectOptions(screen.getAllByLabelText(/ownership/i)[1], "Owned");
    expect(onChange.mock.calls[0][0][1].ownership).toBe("Owned");
  });

  // The row used to be one flex-wrap line holding everything, so a full copy
  // overflowed: Remark was squeezed to a few pixels and the remove control
  // wrapped onto a line of its own under the row. The fields wrap inside
  // their own group now, between a fixed reorder rail and a pinned remove
  // button, so the row itself never wraps.
  it("pins the remove control to the row instead of letting it wrap", () => {
    render(<GameCopiesEditor items={ROWS} onChange={() => {}} />);
    const remove = screen.getAllByRole("button", { name: /remove/i })[0];
    const row = remove.parentElement;
    expect(row.className).not.toMatch(/flex-wrap/);
    expect(row.querySelector(".flex-wrap")).not.toBeNull();
    expect(row.lastElementChild).toBe(remove);
  });
});
