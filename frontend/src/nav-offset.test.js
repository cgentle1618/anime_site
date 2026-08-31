// Guard: sticky page headers must offset by the nav's real height. The nav
// is two rows on lg+ (56px bar + 40px tab strip + 1px rule = 97px), so a
// hard-coded `top-16` (64px) tucks headers under the tab strip. The height
// lives once in index.css as --nav-h; sticky offsets reference it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const read = (p) => readFileSync(join(SRC, p), "utf8");

it("defines --nav-h for both nav shapes in index.css", () => {
  const css = read("index.css");
  expect(css).toMatch(/--nav-h:/);
  // lg+ override for the two-row nav
  expect(css.match(/--nav-h:/g).length).toBeGreaterThanOrEqual(2);
});

const NAV_STUCK_PAGES = [
  "pages/public/Index.jsx",
  "pages/public/Search.jsx",
  "pages/library/CollectionLibrary.jsx",
  "pages/library/FranchiseLibrary.jsx",
];

it.each(NAV_STUCK_PAGES)(
  "%s offsets sticky headers by var(--nav-h), not a stale top-16",
  (page) => {
    const text = read(page);
    expect(text).not.toMatch(/sticky top-16(?![\w-])/);
    expect(text).not.toMatch(/top-\[116px\]/);
    expect(text).toMatch(/var\(--nav-h\)/);
  },
);

it("Search.jsx does not hard-code the 64px nav in its section offset", () => {
  expect(read("pages/public/Search.jsx")).not.toMatch(/64 \+ stickyBarHeight/);
});

it("Index.jsx measures the division header instead of guessing its height", () => {
  const text = read("pages/public/Index.jsx");
  // The subsection sticky offset must come from a measured height, not a
  // hard-coded pixel guess that drifts from the real rendered header.
  expect(text).not.toMatch(/\+52px/);
  expect(text).toMatch(/data-division-header/);
  expect(text).toMatch(/ResizeObserver/);
});

it.each([
  "components/tracker/DashboardCard.jsx",
  "components/tracker/NovelDashboardCard.jsx",
  "components/tracker/ComicDashboardCard.jsx",
])("%s isolates its stacking so steppers stay under sticky headers", (card) => {
  const text = read(card);
  // Card internals use z-10/z-20; without `isolate` on the root those escape
  // into the page stacking context and paint over the sticky section headers.
  expect(text).toMatch(/cursor-pointer relative isolate/);
});
