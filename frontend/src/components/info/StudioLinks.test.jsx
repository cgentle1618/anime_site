import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import InfoCard from "./InfoCard";
import { studioValue } from "./StudioLinks";

function renderValue(item) {
  return render(
    <MemoryRouter>
      <InfoCard title="Production" fields={[{ label: "Studio", value: studioValue(item) }]} />
    </MemoryRouter>,
  );
}

describe("studioValue", () => {
  it("links each credited studio by its display name", () => {
    renderValue({
      studio: "KyoAni, MAPPA",
      studio_refs: [
        { system_id: "s1", display_name: "KyoAni" },
        { system_id: "s2", display_name: "MAPPA" },
      ],
    });
    expect(screen.getByRole("link", { name: "KyoAni" })).toHaveAttribute(
      "href",
      "/studio/s1",
    );
    expect(screen.getByRole("link", { name: "MAPPA" })).toHaveAttribute(
      "href",
      "/studio/s2",
    );
  });

  it("falls back to the plain string when nothing resolved to a studio row", () => {
    // Older payloads, and entries whose studio was never resolved, must not
    // blank out just because there are no ids to link.
    renderValue({ studio: "Some Unresolved Studio", studio_refs: [] });
    expect(screen.getByText("Some Unresolved Studio")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("leaves the field empty when there is no studio at all", () => {
    renderValue({ studio: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
