// Frontend: day-by-day weekly schedule grid used at the top of the dashboard.
import { Link } from "react-router-dom";
import { SCHEDULE_DAYS } from "../../config/weekdays";
import { MEDIA_CONFIG } from "../../config/mediaRegistry";
import { getDisplayName } from "../../utils/media";

/** Sunday-first, so getDay() indexes straight into SCHEDULE_DAYS. */
function getTodayName() {
  return SCHEDULE_DAYS[new Date().getDay()];
}

/**
 * A single entry chip. Entries carry `_media_type` (a MEDIA_CONFIG key), which
 * resolves both the display-name prefix and the detail route — so new media
 * types work here as soon as they are added to the schedule source list.
 */
function ScheduleEntry({ item }) {
  const name = getDisplayName(item, item._media_type);
  const navPath = MEDIA_CONFIG[item._media_type]?.navPath;
  const cls =
    "block px-2.5 py-1.5 rounded-lg text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 break-words leading-tight";

  if (!navPath) return <li className={cls}>{name}</li>;

  return (
    <li>
      <Link
        to={`${navPath}/${item.system_id}`}
        title={name}
        className={`${cls} hover:bg-brand/10 hover:border-brand/30 hover:text-brand transition-colors`}
      >
        {name}
      </Link>
    </li>
  );
}

/**
 * Groups `items` into Sunday–Saturday columns by `dayField`.
 * Entries whose day value is not a recognized weekday are skipped.
 */
export default function WeeklySchedule({
  id,
  title,
  icon,
  subtitle,
  dayField,
  items,
  emptyText = "Nothing scheduled right now.",
}) {
  const today = getTodayName();

  const byDay = Object.fromEntries(SCHEDULE_DAYS.map((d) => [d, []]));
  items.forEach((item) => {
    const day = item[dayField];
    if (byDay[day]) byDay[day].push(item);
  });
  SCHEDULE_DAYS.forEach((d) =>
    byDay[d].sort((a, b) =>
      getDisplayName(a, a._media_type).localeCompare(
        getDisplayName(b, b._media_type),
      ),
    ),
  );

  const total = SCHEDULE_DAYS.reduce((sum, d) => sum + byDay[d].length, 0);

  return (
    <div id={id}>
      <div className="flex items-center justify-between pb-3 mb-2 border-b-2 border-gray-100">
        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
          <i className={`fas ${icon} text-brand/70`}></i>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {subtitle && (
            <span className="hidden sm:inline text-xs text-gray-400 font-medium">
              {subtitle}
            </span>
          )}
          <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-bold border border-gray-200">
            {total}
          </span>
        </div>
      </div>

      {total === 0 ? (
        <div className="pt-2 flex flex-col items-center justify-center py-8 px-4 bg-white/50 rounded-xl border border-gray-200 border-dashed">
          <p className="text-gray-400 font-medium italic">
            <i className="fas fa-ghost mr-2"></i>
            {emptyText}
          </p>
        </div>
      ) : (
        <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {SCHEDULE_DAYS.map((day) => {
            const dayItems = byDay[day];
            const isToday = day === today;
            return (
              <div
                key={day}
                className={`rounded-xl border p-3 ${
                  isToday
                    ? "bg-brand/5 border-brand/30"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-baseline justify-between mb-2 pb-2 border-b border-gray-100">
                  <h3
                    className={`text-xs font-black uppercase tracking-widest ${
                      isToday ? "text-brand" : "text-gray-500"
                    }`}
                  >
                    {day.slice(0, 3)}
                  </h3>
                  <span className="text-[10px] font-bold text-gray-400">
                    {dayItems.length}
                  </span>
                </div>
                {dayItems.length === 0 ? (
                  <p className="text-xs text-gray-300 font-medium italic py-1">
                    —
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {dayItems.map((item) => (
                      <ScheduleEntry key={item.system_id} item={item} />
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
