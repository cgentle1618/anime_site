// Cover image URL resolution and the no-image fallback.

const BUCKET_NAME = "cg1618-anime-covers";

const FALLBACK_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23E5E7EB%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2212%22 fill=%22%236B7280%22 font-weight=%22bold%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E`;

export { FALLBACK_SVG };

export function isLocalHost() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export function getCoverUrl(coverFile) {
  if (!coverFile || coverFile === "N/A") return FALLBACK_SVG;
  return isLocalHost()
    ? `/static/covers/${coverFile}`
    : `https://storage.googleapis.com/${BUCKET_NAME}/${coverFile}`;
}

// Quote images live on local disk under static/quotes/, not in the bucket.
// Cloud Run's filesystem is ephemeral, so anything uploaded there would vanish
// on restart - returning null off localhost is what hides every image control
// in production. Callers just check for null.
export function getQuoteImageUrl(imageFile) {
  if (!imageFile || imageFile === "N/A") return null;
  if (!isLocalHost()) return null;
  return `/static/quotes/${imageFile}`;
}

// ---------------------------------------------------------------------------
// Grouping-tier cover resolution (Franchise, Collection)
//
// Extracted verbatim from FranchiseLibrary.jsx so the Collection library can
// reuse the exact same fallback rules instead of duplicating them.
// ---------------------------------------------------------------------------

/** Best-effort release year, used to prefer the newest entry as a cover. */
export function getEntryYear(entry) {
  const d =
    entry.release_date_jp ||
    entry.release_date_tw ||
    entry.release_date_usa ||
    entry.release_date;
  if (d) return parseInt(String(d).slice(0, 4), 10) || 0;
  return 0;
}

/**
 * Resolve a franchise's cover:
 *   1. its explicitly chosen cover_entry_id
 *   2. else the newest member entry that has a cover image
 *   3. else the newest member entry by convention filename
 *   4. else the placeholder
 */
export function getFranchiseCover(
  franchise,
  allEntriesDict,
  allEntriesByFranchise,
) {
  if (franchise.cover_entry_id) {
    const coverEntry = allEntriesDict[franchise.cover_entry_id];
    if (coverEntry) {
      const file =
        coverEntry.cover_image_file && coverEntry.cover_image_file !== "N/A"
          ? coverEntry.cover_image_file
          : `${coverEntry.system_id}.jpg`;
      return getCoverUrl(file);
    }
  }
  const entries = allEntriesByFranchise[franchise.system_id] || [];
  const withCovers = entries.filter(
    (e) => e.cover_image_file && e.cover_image_file !== "N/A",
  );
  if (withCovers.length > 0) {
    withCovers.sort((a, b) => getEntryYear(b) - getEntryYear(a));
    return getCoverUrl(withCovers[0].cover_image_file);
  }
  if (entries.length > 0) {
    const sorted = [...entries].sort(
      (a, b) => getEntryYear(b) - getEntryYear(a),
    );
    return getCoverUrl(`${sorted[0].system_id}.jpg`);
  }
  return FALLBACK_SVG;
}

/**
 * Resolve a series's cover:
 *   1. its explicitly chosen cover_entry_id (searched across all provided entries)
 *   2. else the newest entry among those that has a cover image
 *   3. else the placeholder
 *
 * Unlike getFranchiseCover, entries are passed as a single combined list -
 * SeriesPage loads six flat entry arrays (anime, movies, TV shows, cartoons,
 * manga, novels) with no per-franchise grouping, so there is no "convention
 * filename" fallback to key off.
 */
export function getSeriesCover(series, entries) {
  if (series.cover_entry_id) {
    const coverEntry = entries.find(
      (e) => e.system_id === series.cover_entry_id,
    );
    if (
      coverEntry &&
      coverEntry.cover_image_file &&
      coverEntry.cover_image_file !== "N/A"
    ) {
      return getCoverUrl(coverEntry.cover_image_file);
    }
  }
  const withCovers = entries.filter(
    (e) => e.cover_image_file && e.cover_image_file !== "N/A",
  );
  if (withCovers.length > 0) {
    withCovers.sort((a, b) => getEntryYear(b) - getEntryYear(a));
    return getCoverUrl(withCovers[0].cover_image_file);
  }
  return FALLBACK_SVG;
}

/**
 * Resolve a collection's cover by delegating to a member franchise:
 *   1. its chosen cover_franchise_id, resolved via getFranchiseCover
 *   2. else the first member franchise (by name) that yields a real cover
 *   3. else the placeholder
 */
export function getCollectionCover(
  collection,
  memberFranchises,
  allEntriesDict,
  allEntriesByFranchise,
) {
  const resolve = (f) =>
    getFranchiseCover(f, allEntriesDict, allEntriesByFranchise);

  if (collection.cover_franchise_id) {
    const chosen = memberFranchises.find(
      (f) => f.system_id === collection.cover_franchise_id,
    );
    if (chosen) {
      const url = resolve(chosen);
      if (url !== FALLBACK_SVG) return url;
    }
  }
  for (const f of memberFranchises) {
    const url = resolve(f);
    if (url !== FALLBACK_SVG) return url;
  }
  return FALLBACK_SVG;
}
