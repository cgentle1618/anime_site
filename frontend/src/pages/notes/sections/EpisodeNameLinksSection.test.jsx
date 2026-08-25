// Frontend: tests for the `episode_name_links` shape - 插入曲 Insert Song.
//
// The shape is the only one carrying all four content columns, and only the
// episode is required. These tests pin both halves of that: a row of episode
// plus name alone must save, and a row with no episode must not.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EpisodeNameLinksSection from "./EpisodeNameLinksSection";

const SECTION = {
  key: "insert_songs",
  shape: "episode_name_links",
  label: "插入曲 Insert Song",
  kinds: [],
  locator_placeholder: "Episode(s), e.g. ep 3",
  locator_required: true,
  desc_required: false,
};

const renderSection = (props = {}) =>
  render(
    <EpisodeNameLinksSection
      section={SECTION}
      notes={[]}
      isAdmin
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      {...props}
    />,
  );

it("shows the episode, the song name, the description and the link", () => {
  renderSection({
    notes: [
      {
        system_id: "n1",
        locator: "ep 12",
        title: "Shiroi Kumo",
        content: "Plays over the rooftop scene.",
        links: ["https://youtu.be/abc"],
      },
    ],
  });

  expect(screen.getByText("ep 12")).toBeInTheDocument();
  expect(screen.getByText("Shiroi Kumo")).toBeInTheDocument();
  expect(screen.getByText("Plays over the rooftop scene.")).toBeInTheDocument();
  expect(screen.getByText("youtu.be")).toBeInTheDocument();
});

it("sends all four fields when a song is added", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  await userEvent.type(
    screen.getByPlaceholderText("Episode(s), e.g. ep 3"),
    "ep 12",
  );
  await userEvent.type(
    screen.getByPlaceholderText("Song name (optional)"),
    "Shiroi Kumo",
  );
  await userEvent.type(
    screen.getByPlaceholderText("Description (optional)"),
    "Rooftop scene.",
  );
  await userEvent.type(
    screen.getByPlaceholderText("https://..."),
    "https://youtu.be/abc",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "insert_songs",
    locator: "ep 12",
    title: "Shiroi Kumo",
    content: "Rooftop scene.",
    links: ["https://youtu.be/abc"],
  });
});

it("saves a song that has only an episode and a name", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  await userEvent.type(
    screen.getByPlaceholderText("Episode(s), e.g. ep 3"),
    "ep 12",
  );
  await userEvent.type(
    screen.getByPlaceholderText("Song name (optional)"),
    "Shiroi Kumo",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "insert_songs",
    locator: "ep 12",
    title: "Shiroi Kumo",
    content: null,
    links: [],
  });
});

it("refuses to save a song with no episode", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  await userEvent.type(
    screen.getByPlaceholderText("Song name (optional)"),
    "Shiroi Kumo",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).not.toHaveBeenCalled();
});
