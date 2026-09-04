// Status-to-display-group maps and airing-status badge classes for library filters.

/**
 * Statuses that count as finished. "Completed (解說)" means the entry was
 * finished through a summary/commentary video rather than the work itself.
 */
export const COMPLETED_STATUSES = ["Completed", "Completed (解說)"];

/**
 * Maps raw watching_status values to display groups used by library filters.
 */
export const WATCHING_STATUS_GROUP = {
  "Plan to Watch":    "Planned",
  "Watch When Airs":  "Planned",
  "Active Watching":  "Watching",
  "Passive Watching": "Watching",
  Paused:             "Watching",
  Completed:          "Completed",
  "Completed (解說)":  "Completed",
  "Temp Dropped":     "Dropped",
  Dropped:            "Dropped",
  "Won't Watch":      "Dropped",
  "Might Watch":      "Might Watch",
};

/**
 * Maps raw reading_status values to display groups used by library filters.
 */
export const READING_STATUS_GROUP = {
  "Plan to Read":    "Planned",
  "Active Reading":  "Reading",
  "Passive Reading": "Reading",
  Paused:            "Reading",
  Completed:         "Completed",
  "Completed (解說)": "Completed",
  "Temp Dropped":    "Dropped",
  Dropped:           "Dropped",
  "Won't Read":      "Dropped",
  "Might Read":      "Might Read",
};

/**
 * Tailwind class strings for airing_status badge colours.
 * Use: AIRING_STATUS_CLS[item.airing_status] ?? AIRING_STATUS_CLS._default
 */
export const AIRING_STATUS_CLS = {
  Airing:            "text-text-muted border border-border-strong",
  "Finished Airing": "text-text-muted border border-border-strong",
  "Not Yet Aired":   "text-text-muted border border-border-strong",
  Canceled:          "text-text-muted border border-border-strong",
  Rumored:           "text-text-muted border border-border-strong",
  _default:          "text-text-faint bg-surface-2",
};

/**
 * The three coarse buckets the status <select>s group their options under.
 * Purely a picking aid for the Add/Modify forms and the detail-page tracker —
 * nothing filters, sorts or counts by them (WATCHING_STATUS_GROUP above is
 * what the library filters use, and it splits the same values differently).
 */
export const STATUS_PICKER_GROUPS = ["Not Released", "On-Going", "Done"];

/**
 * Maps every watching_status AND reading_status value to its picker group.
 * One map covers both vocabularies because no value is shared between them
 * with a different meaning — "Paused" is "Paused" either way.
 */
export const STATUS_PICKER_GROUP = {
  "Might Watch":      "Not Released",
  "Plan to Watch":    "Not Released",
  "Watch When Airs":  "Not Released",
  "Might Read":       "Not Released",
  "Plan to Read":     "Not Released",
  "Active Watching":  "On-Going",
  "Passive Watching": "On-Going",
  "Active Reading":   "On-Going",
  "Passive Reading":  "On-Going",
  Paused:             "On-Going",
  "Temp Dropped":     "On-Going",
  Completed:          "Done",
  "Completed (解說)":  "Done",
  Dropped:            "Done",
  "Won't Watch":      "Done",
  "Won't Read":       "Done",
};

/**
 * Splits a status vocabulary into [{ label, statuses }] for <optgroup>s,
 * keeping the source array's own order inside each group. Groups with no
 * members are dropped, so the same helper serves the watching list (which
 * has "Watch When Airs") and the reading list (which does not).
 *
 * A value with no group — /api/constants is the real source of these arrays,
 * so it can serve one this map has never heard of — lands in a trailing
 * bucket with `label: null`, which the caller renders without an <optgroup>.
 * Never drop it: an unlisted option would silently blank out a saved status.
 */
export function groupStatusOptions(statuses) {
  const buckets = new Map(STATUS_PICKER_GROUPS.map((g) => [g, []]));
  const ungrouped = [];
  for (const status of statuses ?? []) {
    const group = STATUS_PICKER_GROUP[status];
    if (group) buckets.get(group).push(status);
    else ungrouped.push(status);
  }
  const groups = [];
  for (const [label, list] of buckets) {
    if (list.length) groups.push({ label, statuses: list });
  }
  if (ungrouped.length) groups.push({ label: null, statuses: ungrouped });
  return groups;
}
