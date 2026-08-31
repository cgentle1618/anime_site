// Chip: softened archive chip — small radius, faint fill, hairline border —
// and the status-chip call sites must not clamp the label so hard it clips
// ("Finished Airing" was cut off on dashboard and library cards).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";

import { Chip } from "./primitives";

const SRC = join(process.cwd(), "src");

describe("Chip", () => {
  it("is softened: small radius and a faint background fill", () => {
    render(<Chip>Finished Airing</Chip>);
    const chip = screen.getByText("Finished Airing");
    expect(chip.className).toMatch(/rounded/);
    expect(chip.className).toMatch(/bg-/);
  });

  it("uses the hairline border, not the strong rule", () => {
    render(<Chip>Airing</Chip>);
    const chip = screen.getByText("Airing");
    expect(chip.className).not.toMatch(/border-border-strong/);
  });

  it("keeps a fill on every tone", () => {
    for (const tone of ["ink", "brand", "danger", "muted"]) {
      const { unmount } = render(<Chip tone={tone}>{tone}</Chip>);
      expect(screen.getByText(tone).className).toMatch(/bg-/);
      unmount();
    }
  });
});

describe("status chip call sites", () => {
  it("DashboardCard does not clamp the status chip to a fixed width", () => {
    const text = readFileSync(
      join(SRC, "components/tracker/DashboardCard.jsx"),
      "utf8",
    );
    expect(text).not.toMatch(/max-w-\[110px\]/);
  });

  it("MediaCard's guest status chip shrinks instead of clipping at 80px", () => {
    const text = readFileSync(
      join(SRC, "components/cards/MediaCard.jsx"),
      "utf8",
    );
    expect(text).not.toMatch(/max-w-\[80px\]/);
  });
});
