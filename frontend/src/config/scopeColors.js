// Frontend: one hue per media type, for the System Options scope column.
//
// THE ONE EXCEPTION TO DESIGN RULE 5
// ----------------------------------
// docs/frontend/design-system.md rule 5 says colour never encodes a category,
// and config/mediaTypeColors.js still honours that everywhere else: a relation
// graph mixes types but shows a handful at a time, each read from its label.
// The System Options table is the case the rule does not serve. It runs the
// same eight keys down one narrow column across hundreds of rows, where the
// question is "which of these two values is offered in the same places?" -
// a shape comparison, answered instantly by hue and slowly by reading
// "anime-movie" against "anime". Colour is the index here, not decoration.
//
// It stays an index, not the only signal: the key is still written in the
// chip, so nothing is lost to a colourblind reader or a greyscale print.
//
// Classes are spelled out per key rather than built as `bg-scope-${key}`
// because Tailwind scans source text for literal class names - an
// interpolated one is never generated and the chip renders unstyled.
const CHIP = "text-[10px] font-bold rounded px-1.5 py-0.5 border";

export const SCOPE_CHIPS = {
  anime: `${CHIP} bg-scope-anime/12 border-scope-anime/40 text-scope-anime`,
  "anime-movie": `${CHIP} bg-scope-anime-movie/12 border-scope-anime-movie/40 text-scope-anime-movie`,
  movie: `${CHIP} bg-scope-movie/12 border-scope-movie/40 text-scope-movie`,
  "tv-show": `${CHIP} bg-scope-tv-show/12 border-scope-tv-show/40 text-scope-tv-show`,
  cartoon: `${CHIP} bg-scope-cartoon/12 border-scope-cartoon/40 text-scope-cartoon`,
  manga: `${CHIP} bg-scope-manga/12 border-scope-manga/40 text-scope-manga`,
  novel: `${CHIP} bg-scope-novel/12 border-scope-novel/40 text-scope-novel`,
  comic: `${CHIP} bg-scope-comic/12 border-scope-comic/40 text-scope-comic`,
};

// A scope row can hold a key this build has never heard of - an older
// frontend against a database that gained a media type - so an unknown key
// renders as a plain ink chip rather than losing its border and fill.
const FALLBACK = `${CHIP} bg-surface-2 border-border text-text-muted`;

/** Chip classes for one system_option_scope key. */
export function scopeChip(scope) {
  return SCOPE_CHIPS[scope] || FALLBACK;
}
