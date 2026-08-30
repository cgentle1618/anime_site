// Frontend: tracker component file for MyTrackerCard.
export default function MyTrackerCard({
  epFin,
  epTotal,
  hasCum,
  cumFin,
  cumTotal,
  watchingStatus,
  myRating,
  watchNext,
  toRewatch,
  isAdmin,
  onEpChange,
  onStatusChange,
  onRatingChange,
  onWatchNextChange,
  onToRewatchChange,
  statusOptions,
  ratingOptions,
  statusLabel = "Watching Status",
  rewatchLabel = "To Rewatch",
}) {
  const selectDisabledCls = !isAdmin
    ? "bg-surface-2 text-text-faint cursor-not-allowed"
    : "";

  function stepEp(delta) {
    if (!isAdmin) return;
    const cur = epFin || 0;
    const total =
      epTotal != null && epTotal !== "?" ? parseInt(epTotal, 10) : null;
    let next = cur + delta;
    if (total !== null && next > total) next = total;
    if (next < 0) next = 0;
    if (next === cur) return;
    onEpChange(next);
  }

  function handleInputChange(e) {
    if (!isAdmin) return;
    const v = parseInt(e.target.value, 10) || 0;
    if (epTotal !== "?" && epTotal != null && v > parseInt(epTotal)) return;
    onEpChange(Math.max(0, v));
  }

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden border-t-4 border-t-brand">
      <div className="bg-surface-2 border-b border-border px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-text text-lg flex items-center">
            <i className="fas fa-chart-line text-brand mr-2"></i>My Tracker
          </h3>
          {hasCum && (
            <div
              className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold border border-indigo-200 shadow-sm"
              title="Cumulative Episodes"
            >
              Cum: {cumFin}/{cumTotal}
            </div>
          )}
        </div>
        {/* Episode Editor */}
        <div className="flex items-center bg-surface rounded-lg p-1 border border-border shadow-sm">
          <button
            onClick={() => stepEp(-1)}
            disabled={!isAdmin}
            className="w-8 h-8 shrink-0 rounded hover:bg-surface-2 text-text-faint hover:text-text transition flex items-center justify-center disabled:opacity-40"
          >
            <i className="fas fa-minus text-xs"></i>
          </button>
          <div className="font-mono font-bold text-sm tracking-wide flex items-baseline justify-center select-none px-2 min-w-[80px] whitespace-nowrap">
            <input
              type="number"
              value={epFin}
              disabled={!isAdmin}
              onChange={handleInputChange}
              className="text-text w-10 text-right bg-transparent border-b-2 border-transparent hover:border-border-strong focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0 leading-none disabled:opacity-60"
            />
            <span className="text-text-faint mx-1 text-xs">/</span>
            <span className="text-text-faint text-sm leading-none">
              {epTotal}
            </span>
          </div>
          <button
            onClick={() => stepEp(1)}
            disabled={!isAdmin}
            className="w-8 h-8 shrink-0 rounded bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center disabled:opacity-40"
          >
            <i className="fas fa-plus text-xs"></i>
          </button>
        </div>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status */}
        <div className="space-y-1">
          <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wider">
            {statusLabel}
          </label>
          <select
            value={watchingStatus || ""}
            disabled={!isAdmin}
            onChange={(e) => isAdmin && onStatusChange(e.target.value)}
            className={`block w-full border-border-strong rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {/* Rating */}
        <div className="space-y-1">
          <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wider">
            Rating
          </label>
          <select
            value={myRating || ""}
            disabled={!isAdmin}
            onChange={(e) => isAdmin && onRatingChange(e.target.value)}
            className={`block w-full border-border-strong rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
          >
            <option value="">Unrated</option>
            {ratingOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {onWatchNextChange !== undefined && (
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wider">
              Watch Next
            </label>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!watchNext}
                disabled={!isAdmin}
                onChange={(e) => isAdmin && onWatchNextChange(e.target.checked)}
                className="w-4 h-4 rounded accent-brand"
              />
              <span className="text-sm font-medium text-text-muted">
                Watch Next
              </span>
            </label>
          </div>
        )}
        {onToRewatchChange !== undefined && (
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wider">
              {rewatchLabel}
            </label>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!toRewatch}
                disabled={!isAdmin}
                onChange={(e) => isAdmin && onToRewatchChange(e.target.checked)}
                className="w-4 h-4 rounded accent-brand"
              />
              <span className="text-sm font-medium text-text-muted">
                {rewatchLabel}
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

