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
  Airing:            "text-green-700 bg-green-100",
  "Finished Airing": "text-blue-700 bg-blue-100",
  "Not Yet Aired":   "text-orange-700 bg-orange-100",
  Canceled:          "text-red-700 bg-red-100",
  Rumored:           "text-purple-700 bg-purple-100",
  _default:          "text-gray-500 bg-gray-100",
};
