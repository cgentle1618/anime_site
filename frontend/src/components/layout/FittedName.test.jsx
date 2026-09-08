import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FittedName from "./FittedName";

const NAME = "無職轉生，到了異世界就拿出真本事 第三季 上半";

// jsdom has neither a canvas nor real layout, so both inputs the component
// measures with have to be supplied: a 2d context that bills CJK at 12px and
// everything else at 6px, and a clientWidth for the box it was given.
function stubLayout({ width }) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (text) => ({
      width: [...text].reduce(
        (w, ch) => w + (/[⺀-鿿豈-﫿　-〿＀-￯]/.test(ch) ? 12 : 6),
        0,
      ),
    }),
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
}

afterEach(() => vi.restoreAllMocks());

describe("FittedName", () => {
  it("drops the middle, not the tail, when the name overflows", () => {
    stubLayout({ width: 100 });
    render(<FittedName name={NAME} />);

    const shown = screen.getByTitle(NAME).textContent;
    expect(shown).not.toBe(NAME);
    expect(shown).toContain("…");
    expect(shown.startsWith("無職轉生")).toBe(true);
    expect(shown.endsWith("上半")).toBe(true);
  });

  it("leaves a name that fits alone", () => {
    stubLayout({ width: 600 });
    render(<FittedName name={NAME} />);

    expect(screen.getByTitle(NAME).textContent).toBe(NAME);
  });

  it("renders the whole name when there is nothing to measure with", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
    render(<FittedName name={NAME} />);

    expect(screen.getByTitle(NAME).textContent).toBe(NAME);
  });
});
