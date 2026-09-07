import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import InfoCard from "./InfoCard";
import { publisherLabel, studioValue } from "./StudioLinks";

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

describe("publisherLabel", () => {
  it("labels a publisher row from the ref the backend supplied", () => {
    // credit_label() on the backend owns the vocabulary; the page only passes
    // the fallback for the case where no publisher is credited yet.
    const anime = {
      publisher_refs: [
        { system_id: "abc", display_name: "木棉花", label: "台灣代理商" },
      ],
    };
    expect(publisherLabel(anime, "台灣代理商")).toBe("台灣代理商");
  });

  it("falls back to the literal when an entry has no publisher refs", () => {
    expect(publisherLabel({ publisher_refs: [] }, "發行商")).toBe("發行商");
  });

  it("falls back when the payload carries no publisher_refs key at all", () => {
    // A viewer without the Credits permission has publisher_refs gated away.
    expect(publisherLabel(undefined, "出版商")).toBe("出版商");
  });
});
