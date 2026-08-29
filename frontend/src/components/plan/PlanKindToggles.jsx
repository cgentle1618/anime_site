// Frontend: per-media-type plan toggles for one group and one kind.
//
// One control serves both kinds: the Plan page's two sections differ only in
// which scope map they consult and what the row is called. `mediaTypes` is
// what the group actually holds; this component filters that down to the
// types the kind/scope pair allows, so a franchise with no movies never shows
// a Movie toggle.
import { scopesFor } from "../../config/planNextGroups";

const LABELS = {
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
  comic: "Comic",
};

// Read types say "reread"; watch types say "rewatch".
const READ_TYPES = new Set(["manga", "novel", "comic"]);

export function kindLabel(kind, mediaTypes) {
  if (kind === "next") return "Watch/Read Next";
  const allRead = mediaTypes.length > 0 && mediaTypes.every((t) => READ_TYPES.has(t));
  return allRead ? "To Reread" : "To Rewatch";
}

// The subset of `mediaTypes` that the kind/scope pair actually allows —
// shared by this component and by call sites that need to know, before
// rendering their own heading/wrapper, whether this control will render
// anything at all.
export function applicableTypes(kind, scope, mediaTypes) {
  return mediaTypes.filter((t) => scopesFor(kind, t).includes(scope));
}

export default function PlanKindToggles({
  kind,
  scope,
  mediaTypes,
  marked,
  onToggle,
  disabled = false,
}) {
  const applicable = applicableTypes(kind, scope, mediaTypes);
  if (applicable.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {applicable.map((mediaType) => (
        <label
          key={mediaType}
          className="flex items-center gap-2 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={marked.has(mediaType)}
            disabled={disabled}
            onChange={(e) => onToggle(mediaType, e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-xs font-medium text-gray-700">
            {LABELS[mediaType]}
          </span>
        </label>
      ))}
    </div>
  );
}
