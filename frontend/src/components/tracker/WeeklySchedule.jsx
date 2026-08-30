// Frontend: day-by-day weekly schedule grid used at the top of the dashboard.
import { useState } from "react";
import { Link } from "react-router-dom";
import { SCHEDULE_DAYS } from "../../config/weekdays";
import { MEDIA_CONFIG } from "../../config/mediaRegistry";
import { getDisplayName } from "../../utils/media";

/** Sunday-first, so getDay() indexes straight into SCHEDULE_DAYS. */
function getTodayName() {
  return SCHEDULE_DAYS[new Date().getDay()];
}

/** "23:00:00" -> "23:00". Returns "" for null/blank. */
function formatTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

/**
 * A single entry chip. Entries carry `_media_type` (a MEDIA_CONFIG key), which
 * resolves both the display-name prefix and the detail route — so new media
 * types work here as soon as they are added to the schedule source list.
 */
function ScheduleEntry({ item, timeField }) {
  const name = getDisplayName(item, item._media_type);
  const navPath = MEDIA_CONFIG[item._media_type]?.navPath;
  const time = timeField ? formatTime(item[timeField]) : "";
  const cls =
    "block px-2.5 py-1.5 rounded-lg text-sm font-bold text-text-muted bg-surface-2 border border-border leading-tight";

  const body = (
    <>
      {time && (
        <span className="block text-[11px] font-black text-brand/80 tabular-nums">
          {time}
        </span>
      )}
      <span className="block">{name}</span>
    </>
  );

  if (!navPath) return <li className={cls}>{body}</li>;

  return (
    <li>
      <Link
        to={`${navPath}/${item.system_id}`}
        title={time ? `${time} · ${name}` : name}
        className={`${cls} hover:bg-brand/10 hover:border-brand/30 hover:text-brand transition-colors`}
      >
        {body}
      </Link>
    </li>
  );
}

/**
 * Groups `items` into Sunday–Saturday columns by `dayField`.
 * Entries whose day value is not a recognized weekday are skipped.
 * When `timeField` is given, entries show that time and sort by it
 * (missing times last); otherwise they sort by display name.
 * With `collapsible`, the header toggles the day grid; `defaultCollapsed`
 * decides whether it starts closed.
 */
export default function WeeklySchedule({
  id,
  title,
  icon,
  subtitle,
  dayField,
  timeField,
  items,
  emptyText = "Nothing scheduled right now.",
  collapsible = false,
  defaultCollapsed = false,
}) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const today = getTodayName();

  const byDay = Object.fromEntries(SCHEDULE_DAYS.map((d) => [d, []]));
  items.forEach((item) => {
    const day = item[dayField];
    if (byDay[day]) byDay[day].push(item);
  });
  const byName = (a, b) =>
    getDisplayName(a, a._media_type).localeCompare(
      getDisplayName(b, b._media_type),
    );
  SCHEDULE_DAYS.forEach((d) =>
    byDay[d].sort((a, b) => {
      if (timeField) {
        // Zero-padded HH:MM sorts chronologically as text; blanks go last.
        const tA = formatTime(a[timeField]) || "99:99";
        const tB = formatTime(b[timeField]) || "99:99";
        if (tA !== tB) return tA.localeCompare(tB);
      }
      return byName(a, b);
    }),
  );

  const total = SCHEDULE_DAYS.reduce((sum, d) => sum + byDay[d].length, 0);

  return (
    <div id={id}>
      <div
        className={`flex items-center justify-between pb-3 mb-2 border-b-2 border-border ${
          collapsible ? "cursor-pointer select-none" : ""
        }`}
        onClick={collapsible ? () => setCollapsed((v) => !v) : undefined}
      >
        <h2 className="text-xl font-black text-text flex items-center gap-2">
          <i className={`fas ${icon} text-brand/70`}></i>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {subtitle && (
            <span className="hidden sm:inline text-xs text-text-faint font-medium">
              {subtitle}
            </span>
          )}
          <span className="bg-surface-2 text-text-muted px-3 py-1 rounded-full text-sm font-bold border border-border">
            {total}
          </span>
          {collapsible && (
            <i
              className={`fas fa-chevron-${collapsed ? "down" : "up"} text-text-faint text-sm`}
            ></i>
          )}
        </div>
      </div>

      {collapsed ? null : total === 0 ? (
        <div className="pt-2 flex flex-col items-center justify-center py-8 px-4 bg-surface/50 rounded-xl border border-border border-dashed">
          <p className="text-text-faint font-medium italic">
            <i className="fas fa-ghost mr-2"></i>
            {emptyText}
          </p>
        </div>
      ) : (
        // Day columns scroll horizontally so titles get a readable width
        // instead of being squeezed into a 7-across grid.
        <div className="pt-4 flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
          {SCHEDULE_DAYS.map((day) => {
            const dayItems = byDay[day];
            const isToday = day === today;
            return (
              <div
                key={day}
                className={`w-64 shrink-0 rounded-xl border p-3 ${
                  isToday
                    ? "bg-brand-soft border-brand/30"
                    : "bg-surface border-border"
                }`}
              >
                <div className="flex items-baseline justify-between mb-2 pb-2 border-b border-border">
                  <h3
                    className={`text-xs font-black uppercase tracking-widest ${
                      isToday ? "text-brand" : "text-text-faint"
                    }`}
                  >
                    {day.slice(0, 3)}
                  </h3>
                  <span className="text-[10px] font-bold text-text-faint">
                    {dayItems.length}
                  </span>
                </div>
                {dayItems.length === 0 ? (
                  <p className="text-xs text-text-faint/60 font-medium italic py-1">
                    —
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {dayItems.map((item) => (
                      <ScheduleEntry
                        key={item.system_id}
                        item={item}
                        timeField={timeField}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
