import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlanKindToggles, { kindLabel } from "./PlanKindToggles";

const ALL = ["anime", "movie", "tv-show", "novel"];

describe("PlanKindToggles", () => {
  it("offers only types the kind allows at that scope", () => {
    render(
      <PlanKindToggles
        kind="rewatch"
        scope="series"
        mediaTypes={ALL}
        marked={new Set()}
        onToggle={() => {}}
      />,
    );
    // Anime rewatches at franchise scope only, so it must not appear here.
    expect(screen.queryByLabelText("Anime")).toBeNull();
    expect(screen.getByLabelText("Movie")).toBeInTheDocument();
    expect(screen.getByLabelText("Novel")).toBeInTheDocument();
  });

  it("renders nothing when the group holds no applicable type", () => {
    const { container } = render(
      <PlanKindToggles
        kind="rewatch"
        scope="series"
        mediaTypes={["anime"]}
        marked={new Set()}
        onToggle={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reports the toggled type and its next state", async () => {
    const onToggle = vi.fn();
    render(
      <PlanKindToggles
        kind="rewatch"
        scope="franchise"
        mediaTypes={ALL}
        marked={new Set(["movie"])}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByLabelText("Anime"));
    expect(onToggle).toHaveBeenCalledWith("anime", true);

    await userEvent.click(screen.getByLabelText("Movie"));
    expect(onToggle).toHaveBeenCalledWith("movie", false);
  });
});

describe("kindLabel", () => {
  it("says reread when every type is a read type", () => {
    expect(kindLabel("rewatch", ["novel", "comic"])).toBe("To Reread");
  });

  it("says rewatch when any type is watched", () => {
    expect(kindLabel("rewatch", ["novel", "movie"])).toBe("To Rewatch");
  });
});
