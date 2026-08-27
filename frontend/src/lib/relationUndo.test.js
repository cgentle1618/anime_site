// Frontend: tests for the undo stack's pure parts.
//
// The rules worth pinning down are the ones that are not obvious: a kind
// change can flip the stored endpoints, so undoing it is not simply "patch
// the old kind back".
import {
  describeEntry,
  restoringKind,
  storedTupleFromEdge,
  undoRequest,
} from "./relationUndo";

const KINDS = [
  { key: "sequel", label: "Sequel", stored_as: "sequel", symmetric: false },
  { key: "prequel", label: "Prequel", stored_as: "sequel", symmetric: false },
  {
    key: "alternative",
    label: "Alternative",
    stored_as: "alternative",
    symmetric: true,
  },
  {
    key: "adaptation",
    label: "Adaptation",
    stored_as: "adaptation",
    symmetric: false,
  },
];

const BEFORE = {
  from_type: "anime",
  from_id: "a",
  to_type: "anime",
  to_id: "b",
  relation_type: "sequel",
  remark: "old note",
};

describe("restoringKind", () => {
  it("is the old kind when the endpoints did not move", () => {
    // A remark-only edit, or any change that left the row pointing the same
    // way: replaying the old kind restores it exactly.
    const after = { ...BEFORE, relation_type: "adaptation" };
    expect(restoringKind(BEFORE, after, KINDS)).toBe("sequel");
  });

  it("is the inverse input kind when a kind change flipped the endpoints", () => {
    // Sequel -> Prequel rewrites the row as a swapped sequel. Patching plain
    // "sequel" back would leave it swapped, so the undo has to say "prequel".
    const after = {
      ...BEFORE,
      from_id: "b",
      to_id: "a",
      relation_type: "sequel",
    };
    expect(restoringKind(BEFORE, after, KINDS)).toBe("prequel");
  });

  it("falls back to the old kind when nothing inverts it", () => {
    // A symmetric kind never swaps, so there is no second key storing as it.
    const before = { ...BEFORE, relation_type: "alternative" };
    const after = { ...before, from_id: "b", to_id: "a" };
    expect(restoringKind(before, after, KINDS)).toBe("alternative");
  });

  it("treats a type change on the same id as a move", () => {
    // from_id alone is not identity: each media table has its own id space.
    const after = { ...BEFORE, from_type: "manga", to_type: "anime" };
    expect(restoringKind(BEFORE, after, KINDS)).toBe("prequel");
  });
});

describe("undoRequest", () => {
  it("undoes a create by deleting the row that was made", () => {
    expect(undoRequest({ action: "create", created: { system_id: "r1" } })).toEqual({
      method: "DELETE",
      id: "r1",
    });
  });

  it("undoes a delete by posting the captured row back", () => {
    const request = undoRequest({ action: "delete", before: BEFORE });
    expect(request).toEqual({
      method: "POST",
      body: {
        from_type: "anime",
        from_id: "a",
        kind: "sequel",
        to_type: "anime",
        to_id: "b",
        remark: "old note",
      },
    });
  });

  it("undoes an edit by patching the kind and remark back together", () => {
    // Both in one PATCH: an edit that changed each would otherwise need two
    // undos to fully reverse.
    const request = undoRequest({
      action: "edit",
      id: "r1",
      kind: "prequel",
      before: BEFORE,
    });
    expect(request).toEqual({
      method: "PATCH",
      id: "r1",
      body: { kind: "prequel", remark: "old note" },
    });
  });

  it("undoes a swap by swapping back, whatever the kind", () => {
    // Replaying the kind cannot reverse a swap: Adaptation has no second name
    // storing as it, so a plain kind PATCH would normalize to the flipped row
    // again and the undo would do nothing.
    const request = undoRequest({
      action: "edit",
      id: "r1",
      kind: "adaptation",
      swap: true,
      before: { ...BEFORE, relation_type: "adaptation" },
    });
    expect(request).toEqual({
      method: "PATCH",
      id: "r1",
      body: { swap: true, remark: "old note" },
    });
  });

  it("sends an empty remark rather than null when the old row had none", () => {
    // MediaRelationUpdate ignores a null remark, so null would silently keep
    // the text the undo is meant to remove.
    const request = undoRequest({
      action: "edit",
      id: "r1",
      kind: "sequel",
      before: { ...BEFORE, remark: null },
    });
    expect(request.body.remark).toBe("");
  });
});

describe("describeEntry", () => {
  it("names both entries and the kind for a create", () => {
    expect(
      describeEntry({
        action: "create",
        label: "Sequel",
        sourceName: "Fate/Zero",
        targetName: "Fate/stay night",
      }),
    ).toBe('Undo: linked Fate/Zero as the Sequel of Fate/stay night');
  });

  it("says what a delete will bring back", () => {
    expect(
      describeEntry({
        action: "delete",
        label: "Sequel",
        sourceName: "Fate/Zero",
        targetName: "Fate/stay night",
      }),
    ).toBe('Undo: removed the Sequel link between Fate/Zero and Fate/stay night');
  });

  it("says which link an edit touched", () => {
    expect(
      describeEntry({
        action: "edit",
        label: "Sequel",
        sourceName: "Fate/Zero",
        targetName: "Fate/stay night",
      }),
    ).toBe('Undo: edited the link between Fate/Zero and Fate/stay night');
  });

  it("is a plain label when there is nothing to undo", () => {
    expect(describeEntry(null)).toBe("Nothing to undo");
  });
});


describe("storedTupleFromEdge", () => {
  it("splits both node keys back into a type and an id", () => {
    expect(
      storedTupleFromEdge({
        from: "anime:a",
        to: "manga:b",
        relation_type: "adaptation",
        remark: "vols 1-7",
      }),
    ).toEqual({
      from_type: "anime",
      from_id: "a",
      to_type: "manga",
      to_id: "b",
      relation_type: "adaptation",
      remark: "vols 1-7",
    });
  });

  it("keeps a null remark as null", () => {
    // undoRequest is what decides null becomes ""; capturing the row must not
    // pre-empt that, or an edit's undo could not tell "had no remark" apart.
    expect(storedTupleFromEdge({ from: "anime:a", to: "anime:b" }).remark).toBe(
      null,
    );
  });
});
