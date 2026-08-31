// Frontend: media-type chip styling for anywhere eight types share a view.
//
// The relations canvas is the first such place: a graph can hold anime, movies
// and manga side by side. Colour does not encode the category (design rule 5,
// docs/frontend/design-system.md) - the type is read from the chip text, so
// every type gets the same ink chip. The keys stay because the legend derives
// its stable ordering from them; they match MEDIA_TYPE keys used across the app.
const CHIP = "border border-border-strong bg-surface text-text-muted";
const DOT = "bg-text-faint";

export const MEDIA_TYPE_COLORS = Object.fromEntries(
  [
    "anime",
    "anime-movie",
    "movie",
    "tv-show",
    "cartoon",
    "manga",
    "novel",
    "comic",
  ].map((k) => [k, { chip: CHIP, dot: DOT }]),
);

const FALLBACK = { chip: CHIP, dot: DOT };

/** Chip classes for a media type; every type is the same ink chip. */
export function mediaTypeChip(mediaType) {
  return (MEDIA_TYPE_COLORS[mediaType] || FALLBACK).chip;
}
