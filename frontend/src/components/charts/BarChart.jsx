// Frontend: chart component file for BarChart.
export default function BarChart({ items, label }) {
  const max = Math.max(...items.map((d) => d.count), 1);
  const hasData = items.some((d) => d.count > 0);
  return (
    <div>
      <p className="text-xs font-bold text-text-faint uppercase tracking-wider mb-4">
        {label}
      </p>
      {!hasData ? (
        <p className="text-xs text-text-faint italic">No data</p>
      ) : (
        <div className="flex items-end gap-2 h-32">
          {items.map(({ key, count, pct, color }) => (
            <div
              key={key}
              className="flex flex-col items-center flex-1 min-w-0"
            >
              <span className="text-[10px] font-bold text-text-muted mb-0.5">
                {count > 0 ? count : ""}
              </span>
              {pct != null && (
                <span className="text-[9px] font-semibold text-text-faint mb-1">
                  {count > 0 ? `${pct}%` : ""}
                </span>
              )}
              <div
                className={`w-full rounded-t-sm transition-all ${color} ${count === 0 ? "opacity-15" : ""}`}
                style={{
                  height: `${Math.max((count / max) * 72, count > 0 ? 4 : 2)}px`,
                }}
              />
              <span className="text-[9px] font-semibold text-text-faint mt-1.5 truncate w-full text-center">
                {key}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

