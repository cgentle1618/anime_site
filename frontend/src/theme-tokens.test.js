// Guard: no new hard-coded grey utilities. Colours come from the semantic
// tokens in index.css (bg-surface, text-text-muted, border-border, ...) so
// every surface renders correctly in both themes. See docs for the map.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// vitest runs from frontend/; import.meta.url is not a file: URL under jsdom.
const SRC = join(process.cwd(), "src");
const LEGACY = /(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|divide|ring|placeholder)-(?:gray|slate|zinc|neutral)-\d+(?![\w-])/g;

// Deliberate exceptions: the nav sits on the ink surface (dark in both
// themes) and a few overlays are meant to stay dark over cover art.
const ALLOWED_FILES = [/Nav\.jsx$/, /NavSearch\.jsx$/];
const ALLOWED_CLASSES = new Set(["bg-gray-900", "bg-gray-800", "bg-gray-700"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jsx?|css)$/.test(name) && !/\.test\.jsx?$/.test(name)) yield p;
  }
}

it("uses theme tokens instead of hard-coded greys", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    if (ALLOWED_FILES.some((re) => re.test(file))) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(LEGACY)) {
      const bare = match[0].replace(/^(?:[\w-]+:)*/, "");
      if (ALLOWED_CLASSES.has(bare)) continue;
      offenders.push(`${relative(SRC, file)}: ${match[0]}`);
    }
  }
  expect(offenders).toEqual([]);
});
