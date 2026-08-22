// Frontend: owner-type select + owner ComboBox, for attaching a meme.
//
// Wider than QuoteEntryPicker: a meme can belong to a media entry OR to a whole
// series, franchise, or collection, so this offers ten owner types. Quotes stay
// entry-only and keep using QuoteEntryPicker.
import ComboBox from "./ComboBox";
import { selectCls } from "./FormField";
import { useMediaList, LIST_OPTIONS } from "../../hooks/useMediaList";
import { getDisplayName } from "../../lib/naming";

// `value` is what the owner_type column stores; it doubles as the MEDIA_CONFIG
// key, since both use the hyphenated spelling.
export const OWNER_TYPE_OPTIONS = [
  { value: "anime", label: "Anime", tier: false },
  { value: "anime-movie", label: "Anime Movie", tier: false },
  { value: "movie", label: "Movie", tier: false },
  { value: "tv-show", label: "TV Show", tier: false },
  { value: "cartoon", label: "Cartoon", tier: false },
  { value: "manga", label: "Manga", tier: false },
  { value: "novel", label: "Novel", tier: false },
  { value: "series", label: "Series", tier: true },
  { value: "franchise", label: "Franchise", tier: true },
  { value: "collection", label: "Collection", tier: true },
];

export function isTierOwner(ownerType) {
  return !!OWNER_TYPE_OPTIONS.find((o) => o.value === ownerType)?.tier;
}

export default function MemeOwnerPicker({ ownerType, ownerId, onChange }) {
  // MEDIA_CONFIG covers all ten keys, so one hook serves entries and tiers.
  const { data: rows = [], isLoading } = useMediaList(ownerType || undefined, {
    ...LIST_OPTIONS,
    enabled: !!ownerType,
  });

  const items = rows.map((r) => ({
    id: r.system_id,
    label: getDisplayName(r, ownerType) || "(unnamed)",
  }));
  const selectedLabel =
    items.find((i) => String(i.id) === String(ownerId))?.label || "";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide">
          Owner Type
        </label>
        <select
          value={ownerType || ""}
          // Changing type invalidates the owner, so clear it in the same update.
          onChange={(e) => onChange(e.target.value, null)}
          className={selectCls}
        >
          <option value="">Select type...</option>
          <optgroup label="Media Entry">
            {OWNER_TYPE_OPTIONS.filter((o) => !o.tier).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Grouping Tier">
            {OWNER_TYPE_OPTIONS.filter((o) => o.tier).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide">
          Owner
        </label>
        <ComboBox
          items={items}
          selectedId={ownerId}
          inputText={selectedLabel}
          onSelect={(item) => onChange(ownerType, item?.id ?? null)}
          onClear={() => onChange(ownerType, null)}
          placeholder={
            !ownerType
              ? "Pick an owner type first"
              : isLoading
                ? "Loading..."
                : "Search..."
          }
        />
      </div>
    </div>
  );
}
