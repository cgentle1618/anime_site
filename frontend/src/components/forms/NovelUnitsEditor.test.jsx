// NovelUnitsEditor's contracts that matter for a novel_unit row's shape:
// ch_count must only ever be sent for kind "arc" (the DB CHECK constraint
// ck_novel_unit_ch_count_arc_only rejects it on any other kind), the kind
// picker only appears when the novel's type offers more than one kind, and
// reordering swaps rows and renumbers position (1-based) rather than
// reassigning kind or content.
import { fireEvent, render, screen } from "@testing-library/react";

import NovelUnitsEditor from "./NovelUnitsEditor";

it("adds a new row using the type's first kind and next position", () => {
  const onChange = vi.fn();
  render(<NovelUnitsEditor items={[]} novelType="Web" onChange={onChange} />);

  fireEvent.click(screen.getByText(/\+ Add arc/));

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "arc", position: 1 }),
  ]);
});

it("does not show a kind selector when the type offers only one kind", () => {
  render(
    <NovelUnitsEditor
      items={[{ unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "" }]}
      novelType="Light Novel"
      onChange={() => {}}
    />,
  );

  // The rating select is always there; only the kind select is conditional.
  expect(screen.queryByLabelText(/^Kind for /)).not.toBeInTheDocument();
  expect(screen.getByText("+ Add volume")).toBeInTheDocument();
});

it("shows a kind selector when the type offers multiple kinds", () => {
  render(
    <NovelUnitsEditor
      items={[{ unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "" }]}
      novelType="Other"
      onChange={() => {}}
    />,
  );

  expect(screen.getByLabelText(/^Kind for /)).toBeInTheDocument();
  expect(screen.getByText("+ Add unit")).toBeInTheDocument();
});

it("shows the chapters input only for an arc row", () => {
  render(
    <NovelUnitsEditor
      items={[
        { unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "" },
        { unit_kind: "volume", position: 2, unit_key: "", name_cn: "", name_en: "", remark: "" },
      ]}
      novelType="Other"
      onChange={() => {}}
    />,
  );

  expect(screen.getAllByPlaceholderText("chapters")).toHaveLength(1);
});

it("swaps the first and last rows on reorder and renumbers position", () => {
  const onChange = vi.fn();
  const items = [
    { unit_kind: "volume", position: 1, unit_key: "A", name_cn: "", name_en: "", remark: "" },
    { unit_kind: "volume", position: 2, unit_key: "B", name_cn: "", name_en: "", remark: "" },
    { unit_kind: "volume", position: 3, unit_key: "C", name_cn: "", name_en: "", remark: "" },
  ];
  render(<NovelUnitsEditor items={items} novelType="Novel" onChange={onChange} />);

  // Moving the first row up is a no-op (disabled).
  fireEvent.click(screen.getAllByLabelText("Move up")[0]);
  expect(onChange).not.toHaveBeenCalled();

  // Moving the last row down is a no-op (disabled).
  fireEvent.click(screen.getAllByLabelText("Move down")[2]);
  expect(onChange).not.toHaveBeenCalled();

  // Moving the first row down swaps it with the second and renumbers.
  fireEvent.click(screen.getAllByLabelText("Move down")[0]);
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_key: "B", position: 1 }),
    expect.objectContaining({ unit_key: "A", position: 2 }),
    expect.objectContaining({ unit_key: "C", position: 3 }),
  ]);
});

it("removing a row renumbers the remaining rows", () => {
  const onChange = vi.fn();
  const items = [
    { unit_kind: "volume", position: 1, unit_key: "A", name_cn: "", name_en: "", remark: "" },
    { unit_kind: "volume", position: 2, unit_key: "B", name_cn: "", name_en: "", remark: "" },
  ];
  render(<NovelUnitsEditor items={items} novelType="Novel" onChange={onChange} />);

  fireEvent.click(screen.getAllByLabelText("Remove")[0]);

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_key: "B", position: 1 }),
  ]);
});

it("clears ch_count when a row's kind is changed away from arc", () => {
  const onChange = vi.fn();
  const items = [
    { unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "12" },
  ];
  render(<NovelUnitsEditor items={items} novelType="Other" onChange={onChange} />);

  fireEvent.change(screen.getByLabelText(/^Kind for /), { target: { value: "volume" } });

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "volume", ch_count: "" }),
  ]);
});

it("does not force-clear ch_count when a row's kind is changed to arc", () => {
  // Only "Web" offers "arc", and it offers nothing else, so the only way to
  // reach an arc target via the select is a stranded non-arc row on a Web
  // novel (see the "stranded kind" annotated-option test below).
  const onChange = vi.fn();
  const items = [
    { unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "7" },
  ];
  render(<NovelUnitsEditor items={items} novelType="Web" onChange={onChange} />);

  fireEvent.change(screen.getByLabelText(/^Kind for /), { target: { value: "arc" } });

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "arc", ch_count: "7" }),
  ]);
});

it("shows a disabled, annotated option for a stranded kind the current type no longer offers", () => {
  render(
    <NovelUnitsEditor
      items={[{ unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", ch_count: "5" }]}
      novelType="Light Novel"
      onChange={() => {}}
    />,
  );

  // Light Novel offers only "volume", yet the stranded "arc" row still gets
  // a reachable selector, with its own current kind shown disabled.
  const select = screen.getByLabelText(/^Kind for /);
  expect(select.value).toBe("arc");
  const strandedOption = screen.getByText("arc (not valid for this type)");
  expect(strandedOption).toBeDisabled();
});

// Each unit carries its own grade, on the same S..F scale as the novel's own
// my_rating. It applies to every kind, not just volumes, and nothing derives
// from it.
it("offers a rating select on every row, blank by default", () => {
  render(
    <NovelUnitsEditor
      items={[{ unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "" }]}
      novelType="Light Novel"
      onChange={() => {}}
    />,
  );

  const select = screen.getByLabelText("Rating for Vol 1");
  expect(select.value).toBe("");
  expect([...select.options].map((o) => o.value)).toEqual([
    "",
    "S",
    "A+",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
  ]);
});

it("sends the chosen grade back on the row it belongs to", () => {
  const onChange = vi.fn();
  render(
    <NovelUnitsEditor
      items={[
        { unit_kind: "volume", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "" },
        { unit_kind: "volume", position: 2, unit_key: "", name_cn: "", name_en: "", remark: "" },
      ]}
      novelType="Light Novel"
      onChange={onChange}
    />,
  );

  fireEvent.change(screen.getByLabelText("Rating for Vol 2"), {
    target: { value: "A+" },
  });

  const [rows] = onChange.mock.calls[0];
  expect(rows[1]).toEqual(expect.objectContaining({ position: 2, my_rating: "A+" }));
  // The untouched row is passed through as it was - no rating key at all,
  // rather than an explicit undefined.
  expect(rows[0]).not.toHaveProperty("my_rating");
});

it("shows a stored grade as selected", () => {
  render(
    <NovelUnitsEditor
      items={[
        { unit_kind: "arc", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", my_rating: "S" },
      ]}
      novelType="Web"
      onChange={() => {}}
    />,
  );

  expect(screen.getByLabelText("Rating for Arc 1").value).toBe("S");
});

it("keeps the rating on a row whose kind changes", () => {
  const onChange = vi.fn();
  render(
    <NovelUnitsEditor
      items={[
        { unit_kind: "chapter", position: 1, unit_key: "", name_cn: "", name_en: "", remark: "", my_rating: "B" },
      ]}
      novelType="Other"
      onChange={onChange}
    />,
  );

  fireEvent.change(screen.getByLabelText(/^Kind for /), {
    target: { value: "volume" },
  });

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ unit_kind: "volume", my_rating: "B" }),
  ]);
});
