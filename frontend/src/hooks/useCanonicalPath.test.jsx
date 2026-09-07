import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { useCanonicalPath } from "./useCanonicalPath";

// The path is rendered rather than captured into a ref: writing to one during
// render is a lint error, and reading it back out of the DOM is what a user
// would see anyway.
function Probe({ entity }) {
  useCanonicalPath("anime", entity);
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
}

function renderAt(path, entity) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/anime/:publicId/:slug?" element={<Probe entity={entity} />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("path").textContent;
}

const ANIME = { public_id: 47, anime_name_en: "Fullmetal Alchemist" };

describe("useCanonicalPath", () => {
  it("adds the slug when the URL has none", () => {
    const seen = renderAt("/anime/47", ANIME);
    expect(seen).toBe("/anime/47/fullmetal-alchemist");
  });

  it("replaces a stale slug after a rename", () => {
    const seen = renderAt("/anime/47/old-title", ANIME);
    expect(seen).toBe("/anime/47/fullmetal-alchemist");
  });

  it("leaves an already-canonical path alone", () => {
    const seen = renderAt("/anime/47/fullmetal-alchemist", ANIME);
    expect(seen).toBe("/anime/47/fullmetal-alchemist");
  });

  it("does nothing while the entity is still loading", () => {
    const seen = renderAt("/anime/47", null);
    expect(seen).toBe("/anime/47");
  });

  it("does nothing for an entity with no Latin name", () => {
    const seen = renderAt("/anime/93", {
      public_id: 93,
      anime_name_cn: "\u94a2\u4e4b\u70bc\u91d1\u672f\u5e08",
    });
    expect(seen).toBe("/anime/93");
  });
});
