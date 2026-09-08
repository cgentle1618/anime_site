// Detail-page URLs are built in exactly one place. An inline
// `/type/${x.system_id}` link now 404s, because bare-UUID URLs no longer
// route - so this guard fails the build rather than shipping a dead link.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DETAIL_TYPES = [
  "anime-movie",
  "anime",
  "tv-show",
  "watch-order",
  "movie",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
  "collection",
  "franchise",
  "series",
  "studio",
  "publisher",
  "person",
  "character",
];

const PATTERN = new RegExp("[\"'`]/(" + DETAIL_TYPES.join("|") + ")/\\$\\{");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("detail-page links", () => {
  it("are never built inline", () => {
    const offenders = [];
    for (const file of walk(path.resolve(__dirname, ".."))) {
      if (file.endsWith(path.join("lib", "entityPath.js"))) continue;
      const source = fs.readFileSync(file, "utf8");
      source.split("\n").forEach((line, i) => {
        if (PATTERN.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
