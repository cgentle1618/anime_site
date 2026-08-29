// Frontend: Plan page bucket resolution, mirroring app/services/domain/size_group.py.
//
// For most media types a bucket is a standing property of a franchise or series,
// stored as two maps keyed by media type: size_group_derived (written by
// Calculate) and size_group_manual (written by the admin). Manual wins per key.
//
// Comic, manga and novel are different: they group by a column on the entry
// itself and never inherit. Those three vocabularies are frontend-only - the
// Python side covers derived size buckets, which these are not.

import { SIZE_GROUPS } from "../config/planNextGroups";

// Upper bound of each band, in vocabulary order. Only comic is read here -
// every other type inherits its bucket rather than computing one client-side.
// Hand-maintained copy of the "comic" entry in SIZE_THRESHOLDS in
// app/utils/plan_next_kinds.py - keep the two in sync by hand.
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

// Categorical self-grouping: the entry's own column value IS the bucket key,
// with no band arithmetic. Anything outside the tab's vocabulary (including
// null) falls through to `fallback` - "Other" for novel, which owns a real
// Other key, and null for manga, whose empties belong in the trailing group.
function selfBucket(mediaType, value, fallback = null) {
  const keys = (SIZE_GROUPS[mediaType] ?? []).map((g) => g.key);
  return keys.includes(value) ? value : fallback;
}

// An entry's bucket is never stored. Three types resolve it from their own
// column instead of inheriting it, because each has a grouping of its own that
// says more than its franchise's size would: comic by issue count, manga by
// serialization status, novel by type. `selfValue` carries whichever column the
// type reads. Every other type inherits: series first, then franchise.
export function entryBucket(mediaType, selfValue, series, franchise) {
  if (mediaType === "comic") return comicBucket(selfValue);
  if (mediaType === "manga") return selfBucket("manga", selfValue);
  if (mediaType === "novel") return selfBucket("novel", selfValue, "Other");
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
