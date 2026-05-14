import { getCoverUrl, FALLBACK_SVG } from "./media";

export function getDisplayName(f) {
  return (
    f.franchise_name_cn ||
    f.franchise_name_en ||
    f.franchise_name_roman ||
    f.franchise_name_jp ||
    f.franchise_name_alt ||
    "—"
  );
}

export function getEntryYear(entry) {
  if (entry.release_year != null) return parseInt(entry.release_year, 10) || 0;
  const d =
    entry.release_date_jp ||
    entry.release_date_tw ||
    entry.release_date_usa ||
    entry.release_date;
  if (d) return parseInt(String(d).slice(0, 4), 10) || 0;
  return 0;
}

export function getCoverForSlot(franchise, allEntriesByFranchise, forType = null) {
  const entries = allEntriesByFranchise[String(franchise.system_id)] || [];
  if (forType && franchise.type_covers?.[forType]) {
    const chosen = entries.find(
      (e) => String(e.system_id) === franchise.type_covers[forType],
    );
    if (chosen?.cover_image_file && chosen.cover_image_file !== "N/A") {
      return getCoverUrl(chosen.cover_image_file);
    }
  } else if (!forType && franchise.cover_entry_id) {
    const chosen = entries.find(
      (e) => e.system_id === franchise.cover_entry_id,
    );
    if (chosen?.cover_image_file && chosen.cover_image_file !== "N/A") {
      return getCoverUrl(chosen.cover_image_file);
    }
  }
  const withCover = entries.filter(
    (e) => e.cover_image_file && e.cover_image_file !== "N/A",
  );
  if (withCover.length === 0) return FALLBACK_SVG;
  withCover.sort((a, b) => getEntryYear(b) - getEntryYear(a));
  return getCoverUrl(withCover[0].cover_image_file);
}
