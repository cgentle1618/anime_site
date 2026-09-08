// Frontend: tests for the `music_track` shape - OP, ED, Insert and OST.
//
// The shape's two rules are what these pin: the type dropdown is prefilled, so
// it cannot be the thing that makes a row worth saving, and a status alone is
// enough - "I still need the OP" is a real note before the song has a name.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MusicTrackSection from "./MusicTrackSection";

const SECTION = {
  key: "op",
  shape: "music_track",
  label: "OP",
  kinds: ["normal", "different version", "all inclusive version"],
  default_kind: "normal",
  statuses: ["Need", "Pending", "Done"],
  locator_required: false,
  desc_required: false,
};

const renderSection = (props = {}) =>
  render(
    <MusicTrackSection
      section={SECTION}
      notes={[]}
      isAdmin
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      {...props}
    />,
  );

it("shows the name, the type, the status, the remark and the link", () => {
  renderSection({
    notes: [
      {
        system_id: "n1",
        title: "紅蓮華",
        kind: "different version",
        status: "Done",
        content: "TV size only.",
        links: ["https://youtu.be/abc"],
      },
    ],
  });

  expect(screen.getByText("紅蓮華")).toBeInTheDocument();
  expect(screen.getByText("different version")).toBeInTheDocument();
  expect(screen.getByText("Done")).toBeInTheDocument();
  expect(screen.getByText("TV size only.")).toBeInTheDocument();
  expect(screen.getByText("youtu.be")).toBeInTheDocument();
});

it("sends every field when a song is added", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  await userEvent.type(
    screen.getByPlaceholderText("Song name (optional)"),
    "紅蓮華",
  );
  await userEvent.selectOptions(
    screen.getByDisplayValue("normal"),
    "all inclusive version",
  );
  await userEvent.selectOptions(screen.getByDisplayValue("Status"), "Pending");
  await userEvent.type(
    screen.getByPlaceholderText("https://... (optional)"),
    "https://youtu.be/abc",
  );
  await userEvent.type(
    screen.getByPlaceholderText("Remark (optional)"),
    "Full version.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "op",
    title: "紅蓮華",
    kind: "all inclusive version",
    status: "Pending",
    content: "Full version.",
    links: ["https://youtu.be/abc"],
  });
});

it("saves a row that carries only a status", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  await userEvent.selectOptions(screen.getByDisplayValue("Status"), "Need");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "op",
    title: null,
    kind: "normal",
    status: "Need",
    content: null,
    links: [],
  });
});

it("refuses to save a row carrying nothing but the prefilled type", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).not.toHaveBeenCalled();
});
