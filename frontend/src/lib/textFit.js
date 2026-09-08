// Fit a name into a fixed box by measuring it, not by counting characters.
//
// A character budget cannot work here: "無職轉生，到了異世界就拿出真本事 第三季 上半"
// is 22 characters but twice as wide as 22 Latin ones, so any count that suits
// one script overflows or over-trims the other. These helpers measure with the
// element's own font instead, and only then decide where the ellipsis goes.
import { middleTruncate } from "./naming";

// Characters that break anywhere (CJK, kana, fullwidth punctuation) - Latin
// words only break at spaces, and the two wrap differently enough that the
// line simulation has to tell them apart.
const BREAK_ANYWHERE = /[⺀-鿿豈-﫿　-〿＀-￯]/;

// Build a measurer bound to one font. The canvas is reused across calls, and
// widths are memoised per token, because the fit search measures the same
// handful of tokens many times over.
export function makeMeasurer(font) {
  let ctx = null;
  try {
    ctx = document.createElement("canvas").getContext("2d");
  } catch {
    ctx = null;
  }
  // jsdom and any browser without a 2d context give us nothing to measure
  // with; null tells the caller to leave the text alone rather than trim it
  // with made-up numbers.
  if (!ctx) return null;
  ctx.font = font;
  const cache = new Map();
  return (token) => {
    let width = cache.get(token);
    if (width === undefined) {
      width = ctx.measureText(token).width;
      cache.set(token, width);
    }
    return width;
  };
}

// Split into the units a browser is allowed to break between.
function tokenize(text) {
  const tokens = [];
  let word = "";
  for (const ch of text) {
    if (ch === " " || BREAK_ANYWHERE.test(ch)) {
      if (word) {
        tokens.push(word);
        word = "";
      }
      tokens.push(ch);
    } else {
      word += ch;
    }
  }
  if (word) tokens.push(word);
  return tokens;
}

// Greedy line-filling, the same way the browser lays it out. A space that
// lands at a line end collapses, so it never pushes the next token down.
function lineCount(text, measure, maxWidth) {
  let lines = 1;
  let width = 0;
  for (const token of tokenize(text)) {
    const w = measure(token);
    if (token === " ") {
      width += w;
      continue;
    }
    if (width + w > maxWidth && width > 0) {
      lines += 1;
      width = w;
    } else {
      width += w;
    }
  }
  return lines;
}

// The longest middle-truncated form of `text` that still lays out in
// `maxLines`. Binary search rather than a per-character walk: measuring is the
// expensive part, and a 60-character name settles in six probes.
export function fitMiddle(text, measure, maxWidth, maxLines = 2) {
  const full = String(text ?? "");
  if (!measure || !(maxWidth > 0) || !full) return full;
  if (lineCount(full, measure, maxWidth) <= maxLines) return full;

  let low = 1;
  let high = full.length;
  let best = "…";
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = middleTruncate(full, mid);
    if (lineCount(candidate, measure, maxWidth) <= maxLines) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}
