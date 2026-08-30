// Frontend: tracker component file for NovelTrackerBlock.
const PROGRESS_DISPLAY_OPTIONS = [
  { value: "", label: "— Default (VOL Original) —" },
  { value: "ch", label: "CH (Chapters)" },
  { value: "vol_tw", label: "VOL TW (Taiwan Volumes)" },
  { value: "vol_original", label: "VOL Original" },
  { value: "arc_ch", label: "ARC + CH" },
];

const READING_STATUSES = [
  "Might Read",
  "Plan to Read",
  "Active Reading",
  "Passive Reading",
  "Paused",
  "Temp Dropped",
  "Dropped",
  "Won't Read",
  "Completed",
  "Completed (解說)",
];
const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

function stepUp(v) {
  return Math.floor(v) + 1;
}
function stepDown(v) {
  return Math.ceil(v) - 1;
}

const inputCls =
  "text-text w-12 text-right bg-transparent border-b-2 border-transparent hover:border-border-strong focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0 leading-none disabled:opacity-60";
const minusBtnCls =
  "w-8 h-8 shrink-0 rounded hover:bg-surface-2 text-text-faint hover:text-text transition flex items-center justify-center";
const plusBtnCls =
  "w-8 h-8 shrink-0 rounded bg-brand/10 hover:bg-brand text-brand hover:text-white transition flex items-center justify-center";

function TrackerRow({ isHighlighted, label, children }) {
  return (
    <div
      className={`pl-3 pr-2 py-2.5 rounded-r-lg transition-colors ${
        isHighlighted
          ? "border-l-4 border-brand bg-brand-soft"
          : "border-l-4 border-transparent"
      }`}
    >
      <div className="text-[11px] font-bold text-text-faint uppercase tracking-wider mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

export default function NovelTrackerBlock({
  novel,
  isAdmin,
  onChChange,
  onVolChange,
  onArcChange,
  onStatusChange,
  onRatingChange,
  onReadNextChange,
  onToRerereadChange,
  onProgressDisplayChange,
}) {
  const pd = novel.progress_display;
  const volHighlighted = !pd || pd === "vol_original" || pd === "vol_tw";
  const arcHighlighted = pd === "arc_ch";
  const chHighlighted = pd === "ch" || pd === "arc_ch";
  const primaryIsTw = pd === "vol_tw";

  const volFin = novel.vol_fin ?? 0;
  const volTotalTw = novel.vol_total_tw ?? null;
  const volTotalOrig = novel.vol_total_original ?? null;
  const arcFin = novel.arc_fin ?? 0;
  const arcTotal = novel.arc_total ?? null;
  const chFin = novel.ch_fin ?? 0;
  const chTotal = novel.ch_total ?? null;

  const primaryVolTotal = primaryIsTw ? volTotalTw : volTotalOrig;

  function handleVolStep(dir) {
    if (!isAdmin) return;
    const next = dir > 0 ? stepUp(volFin) : stepDown(volFin);
    const bounded = primaryVolTotal !== null ? Math.min(next, primaryVolTotal) : next;
    if (bounded < 0 || bounded === volFin) return;
    onVolChange(bounded);
  }

  function handleArcStep(dir) {
    if (!isAdmin) return;
    const next = dir > 0 ? stepUp(arcFin) : stepDown(arcFin);
    const bounded = arcTotal !== null ? Math.min(next, arcTotal) : next;
    if (bounded < 0 || bounded === arcFin) return;
    onArcChange(bounded);
  }

  function handleChStep(dir) {
    if (!isAdmin) return;
    const next = dir > 0 ? stepUp(chFin) : stepDown(chFin);
    const bounded = chTotal !== null ? Math.min(next, chTotal) : next;
    if (bounded < 0 || bounded === chFin) return;
    onChChange(bounded);
  }

  const selectCls = `block w-full border-border-strong rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${
    !isAdmin ? "bg-surface-2 text-text-faint cursor-not-allowed" : ""
  }`;

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden border-t-4 border-t-brand">
      <div className="bg-surface-2 border-b border-border px-5 py-3.5">
        <h3 className="font-bold text-text text-lg flex items-center">
          <i className="fas fa-book-reader text-brand mr-2"></i>My Tracker
        </h3>
      </div>
      <div className="p-5 space-y-4">

        {/* Status, Rating & Progress Display */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wider">
              Reading Status
            </label>
            <select
              value={novel.reading_status || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onStatusChange(e.target.value)}
              className={selectCls}
            >
              {READING_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wider">
              Rating
            </label>
            <select
              value={novel.my_rating || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onRatingChange(e.target.value)}
              className={selectCls}
            >
              <option value="">Unrated</option>
              {MY_RATINGS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wider">
              Progress Display
            </label>
            <select
              value={novel.progress_display || ""}
              disabled={!isAdmin}
              onChange={(e) => isAdmin && onProgressDisplayChange(e.target.value)}
              className={selectCls}
            >
              {PROGRESS_DISPLAY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Vol tracker */}
        <TrackerRow isHighlighted={volHighlighted} label="Volumes">
          <div className="flex items-center bg-surface rounded-lg p-1 border border-border shadow-sm w-fit">
            {isAdmin && (
              <button type="button" onClick={() => handleVolStep(-1)} className={minusBtnCls}>
                <i className="fas fa-minus text-xs"></i>
              </button>
            )}
            <div className="font-mono text-sm font-bold tracking-wide flex items-baseline px-2 whitespace-nowrap">
              <input
                type="number"
                value={volFin}
                disabled={!isAdmin}
                step="1"
                onChange={(e) => {
                  if (!isAdmin) return;
                  const v = parseFloat(e.target.value) || 0;
                  if (primaryVolTotal !== null && v > primaryVolTotal) return;
                  onVolChange(Math.max(0, v));
                }}
                className={inputCls}
              />
              <span className="text-text-faint mx-1 text-xs">/</span>
              {/* TW total — always first when present */}
              {volTotalTw !== null && (
                <span className={`text-sm leading-none ${primaryIsTw ? "text-text font-bold" : "text-text-faint font-normal"}`}>
                  {volTotalTw}
                </span>
              )}
              {/* Separator only when both totals present */}
              {volTotalTw !== null && volTotalOrig !== null && (
                <span className="text-text-faint/60 mx-1.5 text-xs">;</span>
              )}
              {/* Orig total — always second when present */}
              {volTotalOrig !== null && (
                <span className={`text-sm leading-none ${!primaryIsTw ? "text-text font-bold" : "text-text-faint font-normal"}`}>
                  {volTotalOrig}
                </span>
              )}
              {/* Fallback when neither total is set */}
              {volTotalTw === null && volTotalOrig === null && (
                <span className="text-text-faint text-sm leading-none">?</span>
              )}
              <span className="text-[9px] text-text-faint font-sans ml-1.5">VOL</span>
            </div>
            {isAdmin && (
              <button type="button" onClick={() => handleVolStep(1)} className={plusBtnCls}>
                <i className="fas fa-plus text-xs"></i>
              </button>
            )}
          </div>
        </TrackerRow>

        {/* Arc tracker */}
        <TrackerRow isHighlighted={arcHighlighted} label="Arcs">
          <div className="flex items-center bg-surface rounded-lg p-1 border border-border shadow-sm w-fit">
            {isAdmin && (
              <button type="button" onClick={() => handleArcStep(-1)} className={minusBtnCls}>
                <i className="fas fa-minus text-xs"></i>
              </button>
            )}
            <div className="font-mono font-bold text-sm tracking-wide flex items-baseline px-2 min-w-[90px] whitespace-nowrap">
              <input
                type="number"
                value={arcFin}
                disabled={!isAdmin}
                step="1"
                onChange={(e) => {
                  if (!isAdmin) return;
                  const v = parseFloat(e.target.value) || 0;
                  if (arcTotal !== null && v > arcTotal) return;
                  onArcChange(Math.max(0, v));
                }}
                className={inputCls}
              />
              <span className="text-text-faint mx-1 text-xs">/</span>
              <span className="text-text-faint text-sm leading-none">{arcTotal ?? "?"}</span>
              <span className="text-[9px] text-text-faint font-sans ml-1.5">ARC</span>
            </div>
            {isAdmin && (
              <button type="button" onClick={() => handleArcStep(1)} className={plusBtnCls}>
                <i className="fas fa-plus text-xs"></i>
              </button>
            )}
          </div>
        </TrackerRow>

        {/* Ch tracker */}
        <TrackerRow isHighlighted={chHighlighted} label="Chapters">
          <div className="flex items-center bg-surface rounded-lg p-1 border border-border shadow-sm w-fit">
            {isAdmin && (
              <button type="button" onClick={() => handleChStep(-1)} className={minusBtnCls}>
                <i className="fas fa-minus text-xs"></i>
              </button>
            )}
            <div className="font-mono font-bold text-sm tracking-wide flex items-baseline px-2 min-w-[90px] whitespace-nowrap">
              <input
                type="number"
                value={chFin}
                disabled={!isAdmin}
                step="1"
                onChange={(e) => {
                  if (!isAdmin) return;
                  const v = parseFloat(e.target.value) || 0;
                  if (chTotal !== null && v > chTotal) return;
                  onChChange(Math.max(0, v));
                }}
                className={inputCls}
              />
              <span className="text-text-faint mx-1 text-xs">/</span>
              <span className="text-text-faint text-sm leading-none">{chTotal ?? "?"}</span>
              <span className="text-[9px] text-text-faint font-sans ml-1.5">CH</span>
            </div>
            {isAdmin && (
              <button type="button" onClick={() => handleChStep(1)} className={plusBtnCls}>
                <i className="fas fa-plus text-xs"></i>
              </button>
            )}
          </div>
        </TrackerRow>

        {/* Flags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wider">
              Read Next
            </label>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!novel.read_next}
                disabled={!isAdmin}
                onChange={(e) =>
                  isAdmin &&
                  onReadNextChange(
                    e.target.checked,
                    e.target.checked ? "Added to Read Next" : "Removed from Read Next",
                  )
                }
                className="w-4 h-4 rounded accent-brand"
              />
              <span className="text-sm font-medium text-text-muted">Read Next</span>
            </label>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wider">
              To Reread
            </label>
            <label
              className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={!!novel.to_reread}
                disabled={!isAdmin}
                onChange={(e) =>
                  isAdmin &&
                  onToRerereadChange(
                    e.target.checked,
                    e.target.checked ? "Marked for reread" : "Removed from reread",
                  )
                }
                className="w-4 h-4 rounded accent-brand"
              />
              <span className="text-sm font-medium text-text-muted">To Reread</span>
            </label>
          </div>
        </div>

      </div>
    </div>
  );
}

