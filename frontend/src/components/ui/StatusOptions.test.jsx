// Frontend: unit tests for the grouped status <option> list.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StatusOptions from "./StatusOptions";

function optgroups(container) {
  return [...container.querySelectorAll("optgroup")].map((g) => [
    g.label,
    [...g.children].map((o) => o.value),
  ]);
}

describe("StatusOptions", () => {
  it("renders one <optgroup> per populated picker group", () => {
    const { container } = render(
      <select value="" onChange={() => {}}>
        <StatusOptions statuses={["Plan to Watch", "Paused", "Completed"]} />
      </select>,
    );
    expect(optgroups(container)).toEqual([
      ["Not Released", ["Plan to Watch"]],
      ["On-Going", ["Paused"]],
      ["Done", ["Completed"]],
    ]);
  });

  it("still renders a status it has no group for", () => {
    const { container } = render(
      <select value="" onChange={() => {}}>
        <StatusOptions statuses={["Paused", "Rewatching"]} />
      </select>,
    );
    expect([...container.querySelectorAll("option")].map((o) => o.value)).toEqual([
      "Paused",
      "Rewatching",
    ]);
    expect(optgroups(container)).toEqual([["On-Going", ["Paused"]]]);
  });
});
