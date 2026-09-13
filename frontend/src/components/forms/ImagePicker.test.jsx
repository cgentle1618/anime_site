import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImagePicker from "./ImagePicker";

function renderPicker(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ImagePicker
        ownerType="anime"
        ownerId="11111111-1111-1111-1111-111111111111"
        role="cover"
        value={null}
        onChange={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("ImagePicker", () => {
  it("shows the upload control when there is no image", () => {
    renderPicker();
    expect(screen.getByLabelText(/upload/i)).toBeInTheDocument();
  });

  it("renders the current image when one is set", () => {
    renderPicker({ value: "library/abc123.jpg" });
    // Library keys are not covers and do not live under /static/covers/ -
    // getCoverUrl resolves them straight from /static/ instead.
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/static/library/abc123.jpg",
    );
  });

  it("offers the library picker", () => {
    renderPicker();
    expect(
      screen.getByRole("button", { name: /choose from library/i }),
    ).toBeInTheDocument();
  });
});
