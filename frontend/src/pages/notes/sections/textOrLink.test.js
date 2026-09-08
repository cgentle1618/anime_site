// The one rule the text_or_link shape rests on: what counts as a link.
import { describe, expect, test } from "vitest";

import { classify } from "./textOrLink";

describe("classify", () => {
  test("an https URL becomes a link", () => {
    expect(classify("https://myanimelist.net/reviews/12345")).toEqual({
      content: null,
      links: ["https://myanimelist.net/reviews/12345"],
    });
  });

  test("an http URL becomes a link", () => {
    expect(classify("http://example.com/a")).toEqual({
      content: null,
      links: ["http://example.com/a"],
    });
  });

  test("prose becomes text", () => {
    expect(classify("評價兩極，節奏被詬病")).toEqual({
      content: "評價兩極，節奏被詬病",
      links: [],
    });
  });

  test("a bare domain is text, not a link", () => {
    // Deliberately strict: only an explicit scheme makes a link, so a sentence
    // is never mistaken for a URL.
    expect(classify("myanimelist.net is split on this")).toEqual({
      content: "myanimelist.net is split on this",
      links: [],
    });
  });

  test("surrounding whitespace is trimmed either way", () => {
    expect(classify("  https://example.com/a  ")).toEqual({
      content: null,
      links: ["https://example.com/a"],
    });
    expect(classify("  好評  ")).toEqual({ content: "好評", links: [] });
  });

  test("a URL followed by a comment stays text", () => {
    // One row says one thing; a scheme buried in prose is prose.
    expect(classify("https://example.com/a 這篇最中肯")).toEqual({
      content: "https://example.com/a 這篇最中肯",
      links: [],
    });
  });

  test("blank input is neither", () => {
    expect(classify("   ")).toEqual({ content: null, links: [] });
  });
});
