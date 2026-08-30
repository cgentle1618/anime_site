// Frontend: one colour per media type, for anywhere eight types share a view.
//
// The relations canvas is the first such place: a graph can hold anime, movies
// and manga side by side, and the type has to be readable at a glance without
// reading the badge text. Keys match MEDIA_TYPE keys used across the app.
export const MEDIA_TYPE_COLORS = {
  anime: { chip: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  "anime-movie": { chip: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  movie: { chip: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  "tv-show": { chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  cartoon: { chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  manga: { chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  novel: { chip: "bg-stone-200 text-stone-700", dot: "bg-stone-500" },
  comic: { chip: "bg-red-100 text-red-700", dot: "bg-red-500" },
};

const FALLBACK = { chip: "bg-surface-2 text-text-muted", dot: "bg-text-faint" };

/** Chip classes for a media type, neutral for a type we do not know yet. */
export function mediaTypeChip(mediaType) {
  return (MEDIA_TYPE_COLORS[mediaType] || FALLBACK).chip;
}
