// Frontend: day-by-day weekly schedule grid used at the top of the dashboard.
import { useState } from "react";
import { Link } from "react-router-dom";
import { SCHEDULE_DAYS } from "../../config/weekdays";
import { MEDIA_CONFIG } from "../../config/mediaRegistry";
import { getDisplayName } from "../../utils/media";
import { Chip, Slip } from "../ui/primitives";

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
 * A single entry row. Entries carry `_media_type` (a MEDIA_CONFIG key), which
 * resolves both the display-name prefix and the detail route — so new media
 * types work here as soon as they are added to the schedule source list.
 */
function ScheduleEntry({ item, timeField }) {
  const name = getDisplayName(item, item._media_type);
  const navPath = MEDIA_CONFIG[item._media_type]?.navPath;
  const time = timeField ? formatTime(item[timeField]) : "";
  const cls =
    "block py-1.5 border-b border-border text-sm text-text leading-tight";

  const body = (
    <>
      {time && (
        <span className="block font-mono text-[10px] tracking-[0.14em] text-text-faint tabular-nums">
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
        className={`${cls} hover:text-brand transition-colors`}
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
  // Kept for API compatibility; the archive style draws no decorative icons.
  // eslint-disable-next-line no-unused-vars
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

  const actions = (
    <>
      {subtitle && (
        <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
          {subtitle}
        </span>
      )}
      <Chip tone="ink">{total}</Chip>
      {collapsible && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((v) => !v);
          }}
          className="text-text-faint hover:text-text text-sm px-1"
          aria-label={collapsed ? "Expand" : "Collapse"}
          aria-expanded={!collapsed}
        >
          <i className={`fas fa-chevron-${collapsed ? "down" : "up"}`}></i>
        </button>
      )}
    </>
  );

  return (
    <Slip
      id={id}
      title={title}
      actions={actions}
      padded={false}
      className={collapsible ? "select-none" : ""}
      onClick={collapsible ? () => setCollapsed((v) => !v) : undefined}
    >
      {collapsed ? null : total === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-faint">
          {emptyText}
        </p>
      ) : (
        // Day columns scroll horizontally so titles get a readable width
        // instead of being squeezed into a 7-across grid.
        <div
          className="flex overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {SCHEDULE_DAYS.map((day) => {
            const dayItems = byDay[day];
            const isToday = day === today;
            return (
              <div
                key={day}
                className={`w-64 shrink-0 p-3 border-r border-border last:border-r-0 ${
                  isToday ? "bg-brand-soft" : ""
                }`}
              >
                <div className="flex items-baseline justify-between mb-2 pb-2 border-b border-border">
                  <h4
                    className={`font-mono text-[11px] uppercase tracking-[0.16em] ${
                      isToday ? "text-brand" : "text-text-muted"
                    }`}
                  >
                    {day.slice(0, 3)}
                  </h4>
                  <span className="font-mono text-[10px] text-text-faint">
                    {dayItems.length}
                  </span>
                </div>
                {dayItems.length === 0 ? (
                  <p className="font-mono text-xs text-text-faint py-1">—</p>
                ) : (
                  <ul>
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
    </Slip>
  );
}
