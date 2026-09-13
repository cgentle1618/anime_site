// Frontend: the manager grid renders thumb_key when present, falling back to
// the full-size storage_key only for backfilled legacy rows that have no
// thumbnail. Before this, both the manager and the picker rendered
// storage_key unconditionally, so every grid tile downloaded a full 2000px
// JPEG despite thumb_key already being generated and stored.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Images from "./Images";

const IMAGES = [
  {
    system_id: "img-1",
    storage_key: "library/full-1.jpg",
    thumb_key: "library/thumb-1.jpg",
    attachments: [],
  },
  {
    system_id: "img-2",
    storage_key: "library/full-2.jpg",
    thumb_key: null,
    attachments: [],
  },
];

vi.mock("../../hooks/useImages", () => ({
  useImages: () => ({
    data: { images: IMAGES, total: IMAGES.length },
    isLoading: false,
  }),
  useUploadImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDetachImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("Images manager", () => {
  it("renders thumb_key when present, and falls back to storage_key otherwise", () => {
    const { container } = render(<Images />);
    // The tile <img> renders with alt="" (decorative), which gives it the
    // "presentation" ARIA role rather than "img" - queried by tag instead.
    const imgs = Array.from(container.querySelectorAll("img"));
    const srcs = imgs.map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/static/library/thumb-1.jpg");
    expect(srcs).toContain("/static/library/full-2.jpg");
    expect(srcs).not.toContain("/static/library/full-1.jpg");
  });
});
