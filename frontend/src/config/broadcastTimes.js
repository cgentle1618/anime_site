// Broadcast-time option list shared by the add/modify broadcast-time dropdowns.
// Frontend-only restriction: the backend and database still accept any time.

/**
 * Selectable times of day, quarter-hour granularity ("00:00" … "23:45").
 */
export const BROADCAST_TIMES = Array.from({ length: 24 }, (_, h) =>
  [0, 15, 30, 45].map(
    (m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  ),
).flat();

/**
 * Option list for a given current value. Existing data may hold an off-quarter
 * time (e.g. pulled from MAL); keep it selectable so editing another field
 * doesn't silently drop it.
 */
export function broadcastTimeOptions(current) {
  const v = (current || "").slice(0, 5);
  if (!v || BROADCAST_TIMES.includes(v)) return BROADCAST_TIMES;
  return [...BROADCAST_TIMES, v].sort();
}
