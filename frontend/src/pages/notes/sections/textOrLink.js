// Frontend: the one rule the `text_or_link` shape rests on.
//
// A public review is either what someone said or a pointer to where they said
// it, so the section takes a single input and decides which column it belongs
// in. The rule is deliberately strict - an explicit scheme AND nothing else in
// the field - so a sentence that merely mentions a URL stays prose rather than
// silently becoming a link with the comment lost.
const LINK = /^https?:\/\/\S+$/;

// Split one input into the two columns the API expects. Exactly one is filled;
// the other is sent empty so a PATCH clears whatever was there before.
export function classify(raw) {
  const value = (raw || "").trim();
  if (!value) return { content: null, links: [] };
  return LINK.test(value)
    ? { content: null, links: [value] }
    : { content: value, links: [] };
}

// What one stored row shows in its editor: whichever column it uses.
export const toInput = (note) => note?.content || note?.links?.[0] || "";
