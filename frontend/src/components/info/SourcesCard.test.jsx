// Two sections, not one flat list: where to watch/read, and where to look up.
// Row order comes from the server (vocabulary sort_order), so the card must
// not re-sort.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SourcesCard from "./SourcesCard";

const rows = [
  { system_id: "1", kind: "access", bucket: "main", name: "Bahamut", url: "https://b.test", available: true },
  { system_id: "2", kind: "access", bucket: "main", name: "Netflix", url: null, available: false },
  { system_id: "3", kind: "access", bucket: "restricted", name: "Elsewhere", url: "https://e.test" },
  { system_id: "4", kind: "reference", bucket: "main", name: "Wikipedia", url: "https://w.test" },
];

describe("SourcesCard", () => {
  it("splits access rows from reference rows", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    const watch = screen.getByRole("region", { name: /where to watch/i });
    expect(within(watch).getByText("Bahamut")).toBeInTheDocument();
    expect(within(watch).queryByText("Wikipedia")).not.toBeInTheDocument();
  });

  it("says Where to Read for a reading type", () => {
    render(<SourcesCard sources={rows} mediaType="manga" />);
    expect(screen.getByRole("region", { name: /where to read/i })).toBeInTheDocument();
  });

  it("keeps the server's order", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    const names = screen.getAllByTestId("source-name").map((n) => n.textContent);
    expect(names.slice(0, 2)).toEqual(["Bahamut", "Netflix"]);
  });

  it("renders an unavailable platform as text, not a link", () => {
    render(<SourcesCard sources={rows} mediaType="anime" />);
    expect(screen.queryByRole("link", { name: /netflix/i })).toBeNull();
  });

  it("renders the column-backed links alongside the rows", () => {
    render(
      <SourcesCard sources={rows} mediaType="anime" malLink="https://mal.test" />,
    );
    expect(screen.getByRole("link", { name: /myanimelist/i })).toBeInTheDocument();
  });

  it("says so when there is nothing at all", () => {
    render(<SourcesCard sources={[]} mediaType="anime" />);
    expect(screen.getByText(/no sources recorded/i)).toBeInTheDocument();
  });
});
