// The "Last updated" figure is absent, not blanked.
//
// The server nulls created_at/updated_at for a viewer without
// field_group.system_info, so this component never has to ask about
// permissions - it just must not draw an em-dash where the date would be. A
// placeholder under a "Last updated" label announces that there is a date
// being withheld, which is the thing the gate exists to avoid.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ScoreBlock from "./ScoreBlock";

describe("ScoreBlock", () => {
  it("shows the date when the viewer holds system_info", () => {
    render(<ScoreBlock malScore="8.1" updatedAt="2026-09-01T14:32:07" />);
    expect(screen.getByText("Last updated")).toBeInTheDocument();
  });

  it("omits the whole figure when the timestamp is withheld", () => {
    render(<ScoreBlock malScore="8.1" updatedAt={null} />);
    expect(screen.queryByText("Last updated")).not.toBeInTheDocument();
  });

  it("still renders the scores, which are not gated with it", () => {
    render(<ScoreBlock malScore="8.1" updatedAt={null} />);
    expect(screen.getByText("8.1")).toBeInTheDocument();
  });
});
