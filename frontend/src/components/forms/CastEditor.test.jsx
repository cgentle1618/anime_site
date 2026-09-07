// CastEditor's contracts that matter for a casting row: the seiyuu column
// only exists where ck_casting_voice_scope allows a person_id (anime,
// anime-movie), position stays contiguous after a removal, the character
// combobox never fetches anything until it is actually used (Fix round 1,
// finding 1), the selected pill shows a plain name rather than the search
// annotation (Fix round 1, finding 2), and — the heart of Decision G — the
// character combobox never silently reuses or silently mints a name match;
// it always offers both as separate, explicit choices.
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import CastEditor from "./CastEditor";

// CastEditor is fully controlled: typing a character re-renders it only if
// the parent feeds the updated row back in as `value`. Tests that exercise
// typing need a real (if minimal) parent, not a `vi.fn()` no-op onChange.
function Controlled({ initialRows, mediaType, onChangeSpy }) {
  const [rows, setRows] = useState(initialRows);
  return (
    <CastEditor
      mediaType={mediaType}
      value={rows}
      onChange={(next) => {
        onChangeSpy(next);
        setRows(next);
      }}
    />
  );
}

const YUKI = {
  system_id: "c1",
  name_en: "Yuki",
  display_name: "Yuki",
  casting_count: 1,
};
const YUKI_ENTRIES = [
  {
    media_type: "anime",
    nav_path: "/anime",
    entries: [{ system_id: "e1", display_name: "Show A" }],
  },
];

function row(overrides = {}) {
  return {
    system_id: undefined,
    character_id: null,
    character_name: "",
    person_id: null,
    person_name: "",
    role: "",
    position: 0,
    photo_file: null,
    remark: "",
    ...overrides,
  };
}

function mockFetch({ characters = [], entriesByCharacter = {}, createdCharacter } = {}) {
  return vi.fn((url, init) => {
    const method = init?.method || "GET";
    // The name-searched endpoint the character combobox actually uses.
    if (url.startsWith("/api/character/?name=") && method === "GET") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(characters) });
    }
    // The bare, unfiltered endpoint. Fix round 1 exists so the character
    // combobox never hits this on mount — kept here only so a regression
    // would show up as unexpected data, not a network error.
    if (url === "/api/character/" && method === "GET") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(characters) });
    }
    if (url === "/api/character/" && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(createdCharacter),
      });
    }
    const entriesMatch = /^\/api\/character\/([^/]+)\/entries$/.exec(url);
    if (entriesMatch) {
      // The real endpoint returns an OBJECT ({"groups": [...]}), never a
      // bare array - Fix round: the CastEditor test used to mock a bare
      // array here, which encoded the wrong contract and let CastEditor.jsx
      // ship with `(Array.isArray(groups) ? groups : []).flatMap(...)`
      // silently always-empty against the server's real shape.
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ groups: entriesByCharacter[entriesMatch[1]] || [] }),
      });
    }
    if (url.startsWith("/api/person/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url === "/api/constants") {
      return Promise.resolve({ ok: false });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch());
});

it("renders one row per cast member", async () => {
  const rows = [row({ character_name: "A" }), row({ character_name: "B", position: 1 })];
  render(<CastEditor mediaType="anime" value={rows} onChange={vi.fn()} />);

  expect(screen.getAllByLabelText("Remove")).toHaveLength(2);
  expect(screen.getAllByLabelText("Role")).toHaveLength(2);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("hides the seiyuu column on manga", async () => {
  // ck_casting_voice_scope: nobody voices anyone in a manga, so the UI must
  // not offer what the database will reject.
  render(<CastEditor mediaType="manga" value={[row()]} onChange={vi.fn()} />);
  expect(screen.queryByLabelText(/seiyuu/i)).not.toBeInTheDocument();
  // Manga has no seiyuu column and the character box fetches nothing on
  // mount (Fix round 1) — the only network call is useConstants'
  // unconditional /api/constants, unrelated to this component's own fetch
  // behaviour.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const relevantCalls = fetch.mock.calls.filter(
    ([url]) => url.startsWith("/api/character/") || url.startsWith("/api/person/"),
  );
  expect(relevantCalls).toHaveLength(0);
});

it("shows the seiyuu column on anime and anime-movie", async () => {
  const { unmount } = render(
    <CastEditor mediaType="anime" value={[row()]} onChange={vi.fn()} />,
  );
  expect(screen.getByLabelText(/seiyuu/i)).toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  unmount();

  render(<CastEditor mediaType="anime-movie" value={[row()]} onChange={vi.fn()} />);
  expect(screen.getByLabelText(/seiyuu/i)).toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("renumbers position after a row is removed", async () => {
  const onChange = vi.fn();
  const rows = [
    row({ character_name: "A", position: 0 }),
    row({ character_name: "B", position: 1 }),
    row({ character_name: "C", position: 2 }),
  ];
  render(<CastEditor mediaType="anime" value={rows} onChange={onChange} />);

  fireEvent.click(screen.getAllByLabelText("Remove")[0]);

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ character_name: "B", position: 0 }),
    expect.objectContaining({ character_name: "C", position: 1 }),
  ]);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("fetches nothing for the character combobox until it is typed into", async () => {
  // Fix round 1, finding 1: GET /api/character/ used to be fetched (plus one
  // /entries call per character) on every mount, whether or not the
  // dropdown was ever opened. A row that already has a selection should
  // need no character fetch at all, and an untouched row needs none either.
  render(
    <CastEditor
      mediaType="anime"
      value={[row({ character_id: "c1", character_name: "Yuki" })]}
      onChange={vi.fn()}
    />,
  );

  // Let the seiyuu fetch (unrelated, and legitimate on mount) resolve.
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const characterCalls = fetch.mock.calls.filter(([url]) =>
    url.startsWith("/api/character/"),
  );
  expect(characterCalls).toHaveLength(0);
  // The already-selected character still renders under its plain name with
  // no network round-trip.
  expect(screen.getByText("Yuki")).toBeInTheDocument();
});

it("shows the plain character name in the selected pill, not the entries annotation", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    mockFetch({ characters: [YUKI], entriesByCharacter: { c1: YUKI_ENTRIES } }),
  );

  render(<Controlled initialRows={[row()]} mediaType="anime" onChangeSpy={vi.fn()} />);

  const input = screen.getByPlaceholderText("Character name...");
  await user.type(input, "Yuki");
  const existingOption = await screen.findByRole("button", { name: /Yuki.*Show A/ });
  await user.click(existingOption);

  // Fix round 1, finding 2: the entries annotation is a search aid, not a
  // persistent label — once selected, the pill shows the clean name.
  await waitFor(() => expect(screen.getByText("Yuki")).toBeInTheDocument());
  expect(screen.queryByText(/Show A/)).not.toBeInTheDocument();
});

it("requires an explicit choice before minting a character with an existing name", async () => {
  const user = userEvent.setup();
  const created = { system_id: "c2", display_name: "Yuki" };
  vi.stubGlobal(
    "fetch",
    mockFetch({
      characters: [YUKI],
      entriesByCharacter: { c1: YUKI_ENTRIES },
      createdCharacter: created,
    }),
  );

  const onChange = vi.fn();
  render(
    <Controlled initialRows={[row()]} mediaType="anime" onChangeSpy={onChange} />,
  );

  const input = screen.getByPlaceholderText("Character name...");
  await user.type(input, "Yuki");

  // Both the existing character and the explicit "create new" option must
  // be offered side by side.
  const existingOption = await screen.findByRole("button", { name: /^Yuki/ });
  const createOption = await screen.findByRole("button", {
    name: 'Create new character named "Yuki"',
  });
  expect(existingOption).toBeInTheDocument();
  expect(createOption).toBeInTheDocument();

  // Typing alone (no click) must never have set a character_id — silently
  // reusing OR silently minting on typed text alone is exactly what
  // Decision G forbids.
  expect(onChange).not.toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ character_id: expect.anything() })]),
  );

  // Clicking the explicit "create new" option — not the existing match —
  // must mint a NEW character, distinct from the existing "c1" match, and
  // only a deliberate click can produce that outcome.
  await user.click(createOption);

  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ character_id: "c2", character_name: "Yuki" }),
    ]),
  );
  const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
  expect(lastCall[0].character_id).not.toBe("c1");

  expect(fetch).toHaveBeenCalledWith(
    "/api/character/",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name_en: "Yuki" }),
    }),
  );
});

it("shows which entries an existing character already appears in", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    mockFetch({
      characters: [YUKI],
      entriesByCharacter: { c1: YUKI_ENTRIES },
    }),
  );

  render(<Controlled initialRows={[row()]} mediaType="anime" onChangeSpy={vi.fn()} />);

  const input = screen.getByPlaceholderText("Character name...");
  await user.type(input, "Yuki");

  expect(
    await screen.findByRole("button", { name: /Yuki.*Show A/ }),
  ).toBeInTheDocument();
});
