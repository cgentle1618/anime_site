// Frontend: tests for NotesTemplate's `hideSections` opt-out.
//
// `remark` is a singleton note row, and the Add form, the Modify tabs and the
// hub pages all keep a dedicated remark editor writing that same row through
// the owner router. Rendering this page's `remark` section next to one of them
// puts two editors on one row, and the dedicated one submits page-load state -
// silently reverting, or (when the entry had no remark at load) deleting it.
// So the embedding screens pass hideSections={["remark"]}, and the section must
// disappear without taking any other section with it.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import NotesTemplate from "./NotesTemplate";
import * as api from "./api";

vi.mock("./api");

const SECTIONS = [
  { key: "remark", shape: "text", label: "Remark", kinds: [], singleton: true },
  { key: "overview", shape: "text", label: "Overview", kinds: [] },
  { key: "trivia", shape: "text", label: "Trivia", kinds: [] },
];

const NOTES = [
  { system_id: "n1", section: "remark", content: "keep me", sort_index: 0 },
  { system_id: "n2", section: "overview", content: "an overview", sort_index: 0 },
];

beforeEach(() => {
  vi.mocked(api.fetchSections).mockResolvedValue(SECTIONS);
  vi.mocked(api.fetchNotes).mockResolvedValue(NOTES);
});

const renderTemplate = (props = {}) =>
  render(
    <NotesTemplate ownerType="anime" ownerId="abc" isAdmin {...props} />,
  );

describe("NotesTemplate hideSections", () => {
  it("renders every registry section when nothing is hidden", async () => {
    renderTemplate();
    await waitFor(() => expect(screen.getByText("Remark")).toBeInTheDocument());
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Trivia")).toBeInTheDocument();
  });

  it("omits a hidden section and keeps the rest", async () => {
    renderTemplate({ hideSections: ["remark"] });
    await waitFor(() =>
      expect(screen.getByText("Overview")).toBeInTheDocument(),
    );
    expect(screen.getByText("Trivia")).toBeInTheDocument();
    expect(screen.queryByText("Remark")).not.toBeInTheDocument();
    // The row itself is untouched - only its duplicate editor is gone.
    expect(screen.queryByDisplayValue("keep me")).not.toBeInTheDocument();
  });
});

// Grouping: sections sharing a `group` render inside one card BESIDE the Notes
// card, not within it, and every ungrouped section stays inside Notes.
const GROUPED = [
  { key: "overview", shape: "text", label: "Overview", kinds: [] },
  {
    key: "op",
    shape: "music_track",
    label: "OP",
    kinds: ["normal"],
    default_kind: "normal",
    statuses: ["Need"],
    group: "music",
    group_label: "音樂 Music",
    group_icon: "fa-music",
  },
  {
    key: "ed",
    shape: "music_track",
    label: "ED",
    kinds: ["normal"],
    default_kind: "normal",
    statuses: ["Need"],
    group: "music",
    group_label: "音樂 Music",
    group_icon: "fa-music",
  },
  { key: "trivia", shape: "text", label: "Trivia", kinds: [] },
];

describe("NotesTemplate groups", () => {
  beforeEach(() => {
    vi.mocked(api.fetchSections).mockResolvedValue(GROUPED);
    // Both cards need a row: an empty card opens collapsed, which would hide
    // the very sections these tests are placing.
    vi.mocked(api.fetchNotes).mockResolvedValue([
      { system_id: "m1", section: "op", title: "紅蓮華", status: "Need" },
      { system_id: "o1", section: "overview", content: "an overview" },
    ]);
  });

  it("renders one group card holding its sections, once", async () => {
    renderTemplate();
    await waitFor(() =>
      expect(screen.getByText("音樂 Music")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("音樂 Music")).toHaveLength(1);
    expect(screen.getByText("OP")).toBeInTheDocument();
    expect(screen.getByText("ED")).toBeInTheDocument();
    // A grouped row still renders through its shape component.
    expect(screen.getByText("紅蓮華")).toBeInTheDocument();
  });

  it("leaves ungrouped sections outside the card", async () => {
    renderTemplate();
    await waitFor(() =>
      expect(screen.getByText("Overview")).toBeInTheDocument(),
    );
    const group = screen.getByText("音樂 Music").closest("div.bg-surface");
    expect(group).not.toBeNull();
    expect(group.textContent).not.toContain("Trivia");
    expect(screen.getByText("Trivia")).toBeInTheDocument();
  });

  it("renders the group card beside the Notes card, not inside it", async () => {
    renderTemplate();
    await waitFor(() =>
      expect(screen.getByText("音樂 Music")).toBeInTheDocument(),
    );
    const notesCard = screen.getByText("Notes").closest("div.bg-surface");
    expect(notesCard.textContent).not.toContain("音樂 Music");
    expect(notesCard.textContent).toContain("Overview");
    // Peers under one parent, so the page lays them out with equal weight.
    const groupCard = screen.getByText("音樂 Music").closest("div.bg-surface");
    expect(groupCard.parentElement).toBe(notesCard.parentElement);
  });
});

// Standalone: a section that names no group but sets `standalone` renders as
// its own top-level card. Resources and Questions each stand alone, so wrapping
// either in a GroupCard would stack its label in two headers.
const STANDALONE = [
  { key: "overview", shape: "text", label: "Overview", kinds: [] },
  {
    key: "op",
    shape: "text",
    label: "OP",
    kinds: [],
    group: "music",
    group_label: "音樂 Music",
    group_icon: "fa-music",
  },
  {
    key: "resources",
    shape: "text",
    label: "Resources",
    kinds: [],
    standalone: true,
  },
];

describe("NotesTemplate standalone sections", () => {
  beforeEach(() => {
    vi.mocked(api.fetchSections).mockResolvedValue(STANDALONE);
    // A row in the Notes card, so it does not open collapsed over Overview.
    vi.mocked(api.fetchNotes).mockResolvedValue([
      { system_id: "o1", section: "overview", content: "an overview" },
    ]);
  });

  it("renders a standalone section outside the Notes card and outside every group", async () => {
    renderTemplate();
    await waitFor(() =>
      expect(screen.getByText("Resources")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Resources")).toHaveLength(1);
    const notesCard = screen.getByText("Notes").closest("div.bg-surface");
    expect(notesCard.textContent).toContain("Overview");
    expect(notesCard.textContent).not.toContain("Resources");
    const groupCard = screen.getByText("音樂 Music").closest("div.bg-surface");
    expect(groupCard.textContent).not.toContain("Resources");
  });

  it("renders it as a peer of the Notes and group cards", async () => {
    renderTemplate();
    await waitFor(() =>
      expect(screen.getByText("Resources")).toBeInTheDocument(),
    );
    const notesCard = screen.getByText("Notes").closest("div.bg-surface");
    const solo = screen.getByText("Resources").closest("div.bg-surface");
    expect(solo.parentElement).toBe(notesCard.parentElement);
  });
});

// Collapse defaults: a card with no rows opens collapsed, so a page of mostly
// empty sections reads as a list of headers instead of a wall of "No entries.".
// The header always renders - only the body is hidden - which is why every
// assertion below is about the body, not the label.
describe("NotesTemplate collapse-when-empty", () => {
  const COLLAPSE = [
    { key: "overview", shape: "text", label: "Overview", kinds: [] },
    { key: "trivia", shape: "text", label: "Trivia", kinds: [] },
    {
      key: "op",
      shape: "text",
      label: "OP",
      kinds: [],
      group: "music",
      group_label: "音樂 Music",
      group_icon: "fa-music",
    },
  ];

  beforeEach(() => {
    vi.mocked(api.fetchSections).mockResolvedValue(COLLAPSE);
  });

  it("collapses an empty section and leaves a filled one open", async () => {
    vi.mocked(api.fetchNotes).mockResolvedValue([
      { system_id: "n1", section: "overview", content: "an overview" },
    ]);
    renderTemplate();
    await waitFor(() =>
      expect(screen.getByText("an overview")).toBeInTheDocument(),
    );
    // Trivia has no rows, so its "No entries." hint stays behind the header.
    const trivia = screen.getByText("Trivia").closest("div.bg-surface");
    expect(trivia.textContent).not.toContain("No entries.");
  });

  it("collapses the Notes card and the group card when both are empty", async () => {
    vi.mocked(api.fetchNotes).mockResolvedValue([]);
    renderTemplate();
    await waitFor(() => expect(screen.getByText("Notes")).toBeInTheDocument());
    const notesCard = screen.getByText("Notes").closest("div.bg-surface");
    expect(notesCard.textContent).not.toContain("Overview");
    const groupCard = screen.getByText("音樂 Music").closest("div.bg-surface");
    expect(groupCard.textContent).not.toContain("OP");
  });

  it("keeps a group open when one of its sections has rows", async () => {
    vi.mocked(api.fetchNotes).mockResolvedValue([
      { system_id: "n1", section: "op", content: "紅蓮華" },
    ]);
    renderTemplate();
    await waitFor(() =>
      expect(screen.getByText("音樂 Music")).toBeInTheDocument(),
    );
    expect(screen.getByText("紅蓮華")).toBeInTheDocument();
  });

  it("opens a collapsed card when it is clicked", async () => {
    vi.mocked(api.fetchNotes).mockResolvedValue([]);
    renderTemplate();
    await waitFor(() => expect(screen.getByText("Notes")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Notes"));
    expect(screen.getByText("Overview")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Overview"));
    expect(screen.getByText("No entries.")).toBeInTheDocument();
  });

  it("opens an empty section when Add is clicked, so the draft row shows", async () => {
    vi.mocked(api.fetchNotes).mockResolvedValue([]);
    renderTemplate();
    await waitFor(() => expect(screen.getByText("Notes")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Notes"));
    const trivia = screen.getByText("Trivia").closest("div.bg-surface");
    fireEvent.click(within(trivia).getByRole("button", { name: /Add/ }));
    expect(within(trivia).getByRole("textbox")).toBeInTheDocument();
  });
});
