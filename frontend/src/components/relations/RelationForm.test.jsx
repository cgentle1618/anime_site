// Frontend: tests for the relations form under the canvas.
//
// The form is the canvas's equal, not a shortcut: everything it writes goes to
// the same three endpoints, and what is worth pinning here is the part a drag
// gesture cannot get wrong but a form can - which entry ends up as the stored
// row's `from`, and therefore which way the relation reads.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RelationForm from "./RelationForm";

const KINDS = [
  { key: "sequel", label: "Sequel", inverse_label: "Prequel", family: "timeline", symmetric: false, stored_as: "sequel" },
  { key: "prequel", label: "Prequel", inverse_label: "Sequel", family: "timeline", symmetric: false, stored_as: "sequel" },
  { key: "alternative", label: "Alternative", inverse_label: "Alternative", family: "version", symmetric: true, stored_as: "alternative" },
  { key: "adaptation", label: "Adaptation", inverse_label: "Source", family: "derivation", symmetric: false, stored_as: "adaptation" },
];

const ENTRY = { media_type: "anime", entry_id: "a1", display_name: "Test Anime" };

const CANDIDATES = [
  { media_type: "anime", entry_id: "a1", display_name: "Test Anime" },
  { media_type: "anime", entry_id: "a2", display_name: "Second Season" },
  { media_type: "manga", entry_id: "m1", display_name: "Source Manga" },
];

// One existing relation, read from the viewed entry's side: the row is stored
// "Second Season is the Sequel of Test Anime", so viewing Test Anime the far
// entry is labelled Sequel and the direction is reverse.
const EXISTING = [
  {
    system_id: "r1",
    relation_type: "sequel",
    label: "Sequel",
    family: "timeline",
    direction: "reverse",
    remark: "aired later",
    other: {
      media_type: "anime",
      entry_id: "a2",
      display_name: "Second Season",
      missing: false,
    },
  },
];

function mockFetch(rows = EXISTING) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(rows) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(call) {
  return JSON.parse(call[1].body);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RelationForm", () => {
  it("asks for an entry when none is selected", () => {
    mockFetch();
    render(<RelationForm entry={null} kinds={KINDS} candidates={CANDIDATES} />);
    expect(screen.getByText(/pick an entry/i)).toBeInTheDocument();
  });

  it("lists the selected entry's relations in the stored direction", async () => {
    // Stored as "Second Season is the Sequel of Test Anime". Reading it the
    // other way round would put the wrong kind in the select.
    mockFetch();
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    const row = await screen.findByTestId("relation-row-r1");
    expect(row).toHaveTextContent("Second Season");
    expect(row).toHaveTextContent("Sequel");
    expect(row).toHaveTextContent("Test Anime");
    expect(within(row).getByLabelText(/kind/i)).toHaveValue("sequel");
  });

  it("reads the request for the selected entry", async () => {
    const fetchMock = mockFetch();
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("media_type=anime");
    expect(fetchMock.mock.calls[0][0]).toContain("entry_id=a1");
  });

  it("adds a relation with the selected entry as the subject", async () => {
    // The sentence reads "Test Anime is the Adaptation of Source Manga", so
    // the selected entry is the row's `from` and the picked one is its `to`.
    const fetchMock = mockFetch([]);
    const onWrote = vi.fn();
    render(
      <RelationForm
        entry={ENTRY}
        kinds={KINDS}
        candidates={CANDIDATES}
        onWrote={onWrote}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByLabelText(/other entry/i), "manga:m1");
    await userEvent.selectOptions(screen.getByLabelText(/^kind$/i), "adaptation");
    await userEvent.click(screen.getByRole("button", { name: /add relation/i }));

    await waitFor(() => expect(onWrote).toHaveBeenCalled());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(bodyOf(post)).toMatchObject({
      from_type: "anime",
      from_id: "a1",
      kind: "adaptation",
      to_type: "manga",
      to_id: "m1",
    });
  });

  it("swaps which entry is the subject before writing", async () => {
    // Same pick, sentence flipped: "Source Manga is the Adaptation of Test
    // Anime". Endpoints trade places; the kind is untouched, because the
    // server stores direction in the endpoints rather than in the kind.
    const fetchMock = mockFetch([]);
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByLabelText(/other entry/i), "manga:m1");
    await userEvent.selectOptions(screen.getByLabelText(/^kind$/i), "adaptation");
    await userEvent.click(screen.getByRole("button", { name: /^swap$/i }));
    await userEvent.click(screen.getByRole("button", { name: /add relation/i }));

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(bodyOf(post)).toMatchObject({
      from_type: "manga",
      from_id: "m1",
      to_type: "anime",
      to_id: "a1",
    });
  });

  it("will not add a relation until an entry is picked", async () => {
    mockFetch([]);
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add relation/i })).toBeDisabled(),
    );
  });

  it("offers neither the entry itself nor one it is already related to", async () => {
    // Both would be refused server-side - a self-relation is a 409 and a
    // duplicate is too - so the form does not offer the mistake.
    mockFetch();
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    await screen.findByTestId("relation-row-r1");
    const options = within(screen.getByLabelText(/other entry/i)).getAllByRole(
      "option",
    );
    const values = options.map((o) => o.value).filter(Boolean);
    expect(values).toEqual(["manga:m1"]);
  });

  it("patches the kind of an existing relation", async () => {
    const fetchMock = mockFetch();
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    const row = await screen.findByTestId("relation-row-r1");

    await userEvent.selectOptions(within(row).getByLabelText(/kind/i), "alternative");

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patch[0]).toContain("/api/media-relation/r1");
      expect(bodyOf(patch)).toEqual({ kind: "alternative" });
    });
  });

  it("saves a remark on blur, not on every keystroke", async () => {
    const fetchMock = mockFetch();
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    const row = await screen.findByTestId("relation-row-r1");
    const remark = within(row).getByLabelText(/remark/i);

    await userEvent.clear(remark);
    await userEvent.type(remark, "same year");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(0);

    await userEvent.tab();
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(bodyOf(patch)).toEqual({ remark: "same year" });
    });
  });

  it("swaps an existing relation's direction", async () => {
    const fetchMock = mockFetch();
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    const row = await screen.findByTestId("relation-row-r1");

    await userEvent.click(within(row).getByRole("button", { name: /swap/i }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(bodyOf(patch)).toEqual({ swap: true });
    });
  });

  it("cannot swap a symmetric relation, which reads the same either way", async () => {
    mockFetch([{ ...EXISTING[0], relation_type: "alternative", label: "Alternative" }]);
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    const row = await screen.findByTestId("relation-row-r1");
    expect(within(row).getByRole("button", { name: /swap/i })).toBeDisabled();
  });

  it("removes a relation behind a confirm naming both entries", async () => {
    const fetchMock = mockFetch();
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    const row = await screen.findByTestId("relation-row-r1");

    await userEvent.click(within(row).getByRole("button", { name: /remove/i }));

    expect(confirmed.mock.calls[0][0]).toContain("Second Season");
    expect(confirmed.mock.calls[0][0]).toContain("Test Anime");
    await waitFor(() => {
      const del = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(del[0]).toContain("/api/media-relation/r1");
    });
  });

  it("writes nothing when the remove confirm is declined", async () => {
    const fetchMock = mockFetch();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    const row = await screen.findByTestId("relation-row-r1");

    await userEvent.click(within(row).getByRole("button", { name: /remove/i }));

    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(0);
  });

  it("says so when the entry has no relations yet", async () => {
    mockFetch([]);
    render(<RelationForm entry={ENTRY} kinds={KINDS} candidates={CANDIDATES} />);
    expect(await screen.findByText(/no relations yet/i)).toBeInTheDocument();
  });

  it("reports a rejected write instead of pretending it saved", async () => {
    const fetchMock = vi.fn((url, init) =>
      Promise.resolve(
        init?.method === "POST"
          ? {
              ok: false,
              statusText: "Conflict",
              json: () => Promise.resolve({ detail: "Already related." }),
            }
          : { ok: true, json: () => Promise.resolve([]) },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onError = vi.fn();
    render(
      <RelationForm
        entry={ENTRY}
        kinds={KINDS}
        candidates={CANDIDATES}
        onError={onError}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByLabelText(/other entry/i), "manga:m1");
    await userEvent.click(screen.getByRole("button", { name: /add relation/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Already related."));
  });
});
