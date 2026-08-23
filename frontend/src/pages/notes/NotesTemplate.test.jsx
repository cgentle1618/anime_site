// Frontend: tests for NotesTemplate's `hideSections` opt-out.
//
// `remark` is a singleton note row, and the Add form, the Modify tabs and the
// hub pages all keep a dedicated remark editor writing that same row through
// the owner router. Rendering this page's `remark` section next to one of them
// puts two editors on one row, and the dedicated one submits page-load state -
// silently reverting, or (when the entry had no remark at load) deleting it.
// So the embedding screens pass hideSections={["remark"]}, and the section must
// disappear without taking any other section with it.
import { render, screen, waitFor } from "@testing-library/react";

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
