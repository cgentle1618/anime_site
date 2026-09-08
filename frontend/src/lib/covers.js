// Cover image URL resolution and the no-image fallback.

const FALLBACK_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23E5E7EB%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2212%22 fill=%22%236B7280%22 font-weight=%22bold%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E`;

export { FALLBACK_SVG };

export function isLocalHost() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

// Covers are served from local disk by the app itself, under /static/covers/,
// on every host.
export function getCoverUrl(coverFile) {
  if (!coverFile || coverFile === "N/A") return FALLBACK_SVG;
  return `/static/covers/${coverFile}`;
}

// Quote images live on local disk under static/quotes/.
// Returning null off localhost hides every quote-image control away from the
// dev machine. That gate is a deliberate hold, not a hosting constraint - it is
// to be revisited when self-hosting lands. Callers just check for null.
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
 * Tag a fetched entry list with the media type it was fetched as, which the
 * API payloads do not carry. Only the cover fallback needs it.
 */
export function withMediaType(entries, mediaType) {
  return entries.map((e) => ({ ...e, media_type: mediaType }));
}

/**
 * Cover key for an entry that has no cover_image_file of its own.
 * Callers must tag entries with the media type they were fetched as - the API
 * payloads do not carry one, and without it there is no folder to look in.
 */
function conventionCover(entry) {
  if (!entry.media_type) return FALLBACK_SVG;
  return getCoverUrl(`${entry.media_type}/${entry.system_id}.jpg`);
}

/**
 * Resolve a franchise's cover:
 *   1. its explicitly chosen cover_entry_id
 *   2. else the newest member entry that has a cover image
 *   3. else the newest member entry by convention filename
 *   4. else the placeholder
 *
 * Covers live under owner-typed subfolders, so the convention filename is
 * `<media_type>/<system_id>.jpg`: the id alone no longer names a file. An
 * entry that arrives without a media_type falls through to the placeholder
 * rather than to a guessed, broken URL.
 */
export function getFranchiseCover(
  franchise,
  allEntriesDict,
  allEntriesByFranchise,
) {
  if (franchise.cover_entry_id) {
    const coverEntry = allEntriesDict[franchise.cover_entry_id];
    if (coverEntry) {
      if (coverEntry.cover_image_file && coverEntry.cover_image_file !== "N/A")
        return getCoverUrl(coverEntry.cover_image_file);
      return conventionCover(coverEntry);
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
    return conventionCover(sorted[0]);
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
 * SeriesPage loads one flat array per media type it can hold (anime, movies,
 * TV shows, cartoons, manga, novels, comics, games) with no per-franchise
 * grouping, so there is no "convention filename" fallback to key off. The
 * caller must pass every one of them: a series whose chosen cover_entry_id
 * points at a type left out of the list silently falls back to the
 * placeholder.
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
