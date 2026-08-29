// Frontend: per-media-type plan toggle and size-bucket override for a
// franchise or series.
//
// The override dropdown's blank option means "use whatever Calculate derived",
// and the derived value shows as the placeholder so the effective bucket is
// always visible without having to guess which map won.
import { SIZE_GROUPS } from "../../config/planNextGroups";

export default function SizeGroupControls({
  mediaTypes,
  planned,
  derived,
  manual,
  onTogglePlan,
  onOverride,
}) {
  if (!mediaTypes.length) return null;

  return (
    <div className="space-y-3">
      {mediaTypes.map((mediaType) => {
        const groups = SIZE_GROUPS[mediaType] ?? [];
        const derivedKey = derived?.[mediaType] ?? null;
        const derivedLabel =
          groups.find((g) => g.key === derivedKey)?.label ?? "none";
        return (
          <div key={mediaType} className="flex items-center gap-3">
            <label className="flex items-center gap-2 w-40">
              <input
                type="checkbox"
                checked={planned.has(mediaType)}
                onChange={(e) => onTogglePlan(mediaType, e.target.checked)}
              />
              <span className="text-sm font-semibold capitalize">
                {mediaType.replace("-", " ")}
              </span>
            </label>

            {groups.length > 0 && (
              <select
                className="border rounded px-2 py-1 text-sm"
                value={manual?.[mediaType] ?? ""}
                onChange={(e) => onOverride(mediaType, e.target.value || null)}
              >
                <option value="">Derived: {derivedLabel}</option>
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
