// Frontend: tests for the branch connector fan.
//
// The drawing itself is React Flow's; what is worth pinning is the arithmetic
// that decides where each line of a fan starts and which line is which, since
// that is the whole difference between six relations reading as six and
// reading as one.
import { spread } from "./FanEdge";
import { fanPositions } from "./RelationGraph";

function edge(system_id, from, to, family = "branch") {
  return { system_id, from, to, family, label: family };
}

describe("spread", () => {
  it("leaves a lone connector dead centre", () => {
    // One branch must still read as a plain vertical drop, not as a line
    // leaving from off to one side for no visible reason.
    expect(spread(0, 1, 26, 132)).toBe(0);
  });

  it("spreads a fan symmetrically about the node's centre", () => {
    const offsets = [0, 1, 2, 3, 4].map((i) => spread(i, 5, 26, 132));
    expect(offsets[0]).toBe(-offsets[4]);
    expect(offsets[1]).toBe(-offsets[3]);
    expect(offsets[2]).toBe(0);
  });

  it("gives every line of a fan its own starting point", () => {
    // Two lines sharing a start would also share an angle, which is the state
    // this whole edge type exists to get out of.
    const offsets = [0, 1, 2, 3, 4, 5].map((i) => spread(i, 6, 26, 132));
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it("stops widening once the fan would overhang the node", () => {
    // Past the cap the outermost line would leave from thin air beside the
    // node rather than from under it.
    const wide = [0, 19].map((i) => spread(i, 20, 26, 132));
    expect(wide[1] - wide[0]).toBe(132);
  });
});

describe("fanPositions", () => {
  it("numbers the branches leaving one work", () => {
    const fan = fanPositions([
      edge("1", "anime:school", "anime:s1"),
      edge("2", "anime:wall1", "anime:s1"),
      edge("3", "anime:ova", "anime:s1"),
    ]);
    expect([...fan.values()].map((v) => v.count)).toEqual([3, 3, 3]);
    expect([...fan.values()].map((v) => v.index).sort()).toEqual([0, 1, 2]);
  });

  it("orders the lines the way the layout fans the nodes", () => {
    // layoutGraph places siblings across the row in key order, so numbering
    // the lines the same way is what keeps line 1 on the leftmost branch and
    // stops the fan crossing over itself.
    const fan = fanPositions([
      edge("1", "anime:wall1", "anime:s1"),
      edge("2", "anime:ova", "anime:s1"),
      edge("3", "anime:school", "anime:s1"),
    ]);
    expect(fan.get("2").index).toBe(0); // anime:ova
    expect(fan.get("3").index).toBe(1); // anime:school
    expect(fan.get("1").index).toBe(2); // anime:wall1
  });

  it("counts each source's fan separately", () => {
    const fan = fanPositions([
      edge("1", "anime:school", "anime:s1"),
      edge("2", "anime:wall1", "anime:s1"),
      edge("3", "anime:extra", "anime:other"),
    ]);
    expect(fan.get("1").count).toBe(2);
    expect(fan.get("3")).toEqual({ index: 0, count: 1 });
  });

  it("renumbers around a hidden family", () => {
    // toFlowEdges numbers only what it is about to draw. Numbering everything
    // instead would leave the visible lines fanned around gaps where the
    // filtered-out ones would have been.
    const all = [
      edge("1", "anime:school", "anime:s1"),
      edge("2", "manga:t", "anime:s1", "derivation"),
      edge("3", "anime:wall1", "anime:s1"),
    ];
    const shown = fanPositions(all.filter((e) => e.family !== "derivation"));
    expect(shown.get("1")).toEqual({ index: 0, count: 2 });
    expect(shown.get("3")).toEqual({ index: 1, count: 2 });
  });
});
