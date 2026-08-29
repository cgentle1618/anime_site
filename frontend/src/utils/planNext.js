// Frontend: size-bucket resolution, mirroring app/services/domain/size_group.py.
//
// A bucket is a standing property of a franchise or series, stored as two maps
// keyed by media type: size_group_derived (written by Calculate) and
// size_group_manual (written by the admin). Manual wins per key.

import { SIZE_GROUPS } from "../config/planNextGroups";

// Upper bound of each band, in vocabulary order. Only comic is read here -
// every other type inherits its bucket rather than computing one client-side.
const COMIC_BANDS = [
  [3, "1_3"],
  [10, "4_10"],
  [null, "11_plus"],
];

export function effectiveBucket(derived, manual, mediaType) {
  if (manual && manual[mediaType]) return manual[mediaType];
  if (derived && derived[mediaType]) return derived[mediaType];
  return null;
}

function comicBucket(issueTotal) {
  if (!issueTotal || issueTotal <= 0) return null;
  for (const [upper, key] of COMIC_BANDS) {
    if (upper === null || issueTotal <= upper) return key;
  }
  return null;
}

function groupBucket(group, mediaType) {
  if (!group) return null;
  return effectiveBucket(
    group.size_group_derived,
    group.size_group_manual,
    mediaType,
  );
}

// An entry's bucket is never stored. Comic is the one exception to inheritance:
// an individual run has a meaningful issue count of its own.
export function entryBucket(mediaType, issueTotal, series, franchise) {
  if (mediaType === "comic") return comicBucket(issueTotal);
  return groupBucket(series, mediaType) ?? groupBucket(franchise, mediaType);
}

// Buckets in vocabulary order, always all of them so an empty band still
// renders its heading, plus a trailing ungrouped pile.
export function groupByBucket(rows, mediaType) {
  const grouped = {};
  for (const { key } of SIZE_GROUPS[mediaType] ?? []) grouped[key] = [];
  grouped.ungrouped = [];
  for (const row of rows) {
    const key = row.bucket && row.bucket in grouped ? row.bucket : "ungrouped";
    grouped[key].push(row);
  }
  return grouped;
}
