// Frontend: chart component file for BarChart.
//
// A flat column chart: brand bars under mono labels. `color` on an item is
// still accepted by callers and ignored - the series colour is always the
// brand.
export default function BarChart({ items, label }) {
  const max = Math.max(...items.map((d) => d.count), 1);
  const hasData = items.some((d) => d.count > 0);
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint mb-4">
        {label}
      </p>
      {!hasData ? (
        <p className="text-xs text-text-faint">No data</p>
      ) : (
        <div className="flex items-end gap-2 h-32">
          {items.map(({ key, count, pct }) => (
            <div key={key} className="flex flex-col items-center flex-1 min-w-0">
              <span className="font-mono text-[10px] text-text-muted tabular-nums mb-0.5">
                {count > 0 ? count : ""}
              </span>
              {pct != null && (
                <span className="font-mono text-[9px] text-text-faint tabular-nums mb-1">
                  {count > 0 ? `${pct}%` : ""}
                </span>
              )}
              <div
                className={`w-full transition-all ${count === 0 ? "bg-border-strong opacity-40" : "bg-brand"}`}
                style={{
                  height: `${Math.max((count / max) * 72, count > 0 ? 4 : 2)}px`,
                }}
              />
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-faint mt-1.5 truncate w-full text-center">
                {key}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
