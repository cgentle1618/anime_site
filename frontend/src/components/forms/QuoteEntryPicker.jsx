// Frontend: media-type select + entry ComboBox, for attaching a quote to an
// entry. Self-contained: it loads only the chosen type's list, so the admin
// pages do not have to fetch all seven libraries up front.
import ComboBox from "./ComboBox";
import { selectCls } from "./FormField";
import { useMediaList, LIST_OPTIONS } from "../../hooks/useMediaList";
import { getDisplayName } from "../../lib/naming";

// The stored media_type value doubles as the MEDIA_CONFIG key — both use the
// hyphenated spelling — so no translation table is needed.
export const MEDIA_TYPE_OPTIONS = [
  { value: "anime", label: "Anime" },
  { value: "anime-movie", label: "Anime Movie" },
  { value: "movie", label: "Movie" },
  { value: "tv-show", label: "TV Show" },
  { value: "cartoon", label: "Cartoon" },
  { value: "manga", label: "Manga" },
  { value: "novel", label: "Novel" },
  { value: "comic", label: "Comic" },
];

export function configKeyFor(mediaType) {
  return MEDIA_TYPE_OPTIONS.find((m) => m.value === mediaType)?.value;
}

export default function QuoteEntryPicker({
  mediaType,
  entryId,
  onChange,
  required = false,
}) {
  const configKey = configKeyFor(mediaType);
  const { data: entries = [], isLoading } = useMediaList(configKey, {
    ...LIST_OPTIONS,
    enabled: !!configKey,
  });

  const items = entries.map((e) => ({
    id: e.system_id,
    label: getDisplayName(e, configKey) || "(unnamed)",
  }));

  const selectedLabel =
    items.find((i) => String(i.id) === String(entryId))?.label || "";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide">
          Media Type
        </label>
        <select
          value={mediaType || ""}
          // Changing type invalidates the entry, so clear it in the same update.
          onChange={(e) => onChange(e.target.value, null)}
          className={selectCls}
        >
          <option value="">Select type...</option>
          {MEDIA_TYPE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide">
          Entry
        </label>
        <ComboBox
          items={items}
          selectedId={entryId}
          inputText={selectedLabel}
          onSelect={(id) => onChange(mediaType, id ?? null)}
          onClear={() => onChange(mediaType, null)}
          placeholder={
            !mediaType
              ? "Pick a media type first"
              : isLoading
                ? "Loading entries..."
                : "Search entries..."
          }
          required={required}
        />
      </div>
    </div>
  );
}
