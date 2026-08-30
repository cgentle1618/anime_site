import { fireEvent, render, screen } from "@testing-library/react";

import {
  imdbRatingSort,
  malRatingSort,
  planFlagColumn,
  watchButtonColumn,
} from "./libraryColumns";

it("watch column shows the status as text to a viewer and a toggle to an admin", () => {
  const col = watchButtonColumn();
  const item = { watching_status: "Watching" };

  render(<div>{col.render(item, { isAdmin: false, handleStatusToggle: vi.fn() })}</div>);
  expect(screen.getByText("Watching")).toBeInTheDocument();

  const toggle = vi.fn();
  render(<div>{col.render(item, { isAdmin: true, handleStatusToggle: toggle })}</div>);
  fireEvent.click(screen.getByRole("button"));
  expect(toggle).toHaveBeenCalledWith(expect.anything(), item, expect.any(String));
});

it("plan-flag column reports the field it is bound to", () => {
  const toggle = vi.fn();
  const col = planFlagColumn("read_next", "Read Next");
  expect(col.key).toBe("read_next");
  render(<div>{col.render({ read_next: false }, { isAdmin: true, handleStatusToggle: toggle })}</div>);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(toggle).toHaveBeenCalledWith(expect.anything(), { read_next: false }, true, "read_next");
});

it("rating sorts put the highest first and unrated last", () => {
  const rows = [{ mal_rating: "7.1" }, { mal_rating: null }, { mal_rating: "8.9" }];
  expect([...rows].sort(malRatingSort.compare).map((r) => r.mal_rating)).toEqual(["8.9", "7.1", null]);
  const movies = [{ imdb_rating: "N/A" }, { imdb_rating: "8.0" }, { imdb_rating: "6.5" }];
  expect([...movies].sort(imdbRatingSort.compare).map((r) => r.imdb_rating)).toEqual(["8.0", "6.5", "N/A"]);
});
