import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PersonSubTabBar, { PERSON_SUB_TABS } from "./PersonSubTabBar";

describe("PersonSubTabBar", () => {
  it("offers exactly the five person types", () => {
    expect(PERSON_SUB_TABS.map((t) => t.key)).toEqual([
      "director",
      "producer",
      "composer",
      "author",
      "illustrator",
    ]);
  });

  it("labels composer as it reads in the forms", () => {
    expect(PERSON_SUB_TABS.find((t) => t.key === "composer").label).toBe(
      "Music / Composer",
    );
  });

  it("marks the active tab and calls back on select", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PersonSubTabBar active="author" onSelect={onSelect} />);

    const author = screen.getByRole("button", { name: /Author/ });
    expect(author.className).toContain("border-brand");

    await user.click(screen.getByRole("button", { name: /Director/ }));
    expect(onSelect).toHaveBeenCalledWith("director");
  });
});
