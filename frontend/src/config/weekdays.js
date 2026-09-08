// Day-of-week option list shared by the broadcast/watch-day dropdowns.

/**
 * Valid values for anime.broadcast_day and anime.my_watch_day.
 */
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Column order for the dashboard weekly schedule.
 * Sunday-first so the index lines up with Date.prototype.getDay().
 */
export const SCHEDULE_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
