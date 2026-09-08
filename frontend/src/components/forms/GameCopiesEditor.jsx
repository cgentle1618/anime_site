// Frontend: form component for a game's copies (one row per copy owned or wanted).
//
// Controlled exactly the way NovelUnitsEditor is: no internal state, the
// parent owns `items`, and every add / remove / edit / move goes out through
// onChange with `position` renumbered 1..n. The array handed in is never
// written to — each mutation builds a new one.
import {
  GAME_ACQUISITION_KINDS,
  GAME_COPY_FORMATS,
  GAME_OWNERSHIP_KINDS,
  GAME_STOREFRONTS,
  PRICE_CURRENCIES,
} from "../../config/fieldOptions";
import { isValidReleaseDate } from "../../lib/releaseDate";

const baseCls =
  "border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface";
const selectCls = baseCls + " w-36 shrink-0";
const smallSelectCls = baseCls + " w-28 shrink-0";
const priceCls = baseCls + " w-24 shrink-0";
const dateCls = baseCls + " w-32 shrink-0";
const remarkCls = baseCls + " flex-1 basis-40 min-w-0";

// A row is named by its storefront where it has one, so the select labels
// read "Ownership for Steam" rather than "Ownership for row 2".
function rowName(entry, i) {
  return entry.storefront || `copy ${i + 1}`;
}

function Select({ label, value, options, onChange, className = selectCls }) {
  return (
    <select
      className={className}
      value={value || ""}
      aria-label={label}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export default function GameCopiesEditor({ items, onChange }) {
  const rows = items || [];

  const renumber = (list) => list.map((r, i) => ({ ...r, position: i + 1 }));

  const addEntry = () =>
    onChange(
      renumber([
        ...rows,
        {
          storefront: "",
          ownership: "",
          copy_format: "",
          acquisition: "",
          price_paid: "",
          price_currency: "",
          acquired_date: "",
          remark: "",
        },
      ]),
    );

  const removeEntry = (i) => onChange(renumber(rows.filter((_, j) => j !== i)));

  const updateEntry = (i, field, value) =>
    onChange(rows.map((x, j) => (j === i ? { ...x, [field]: value } : x)));

  // Swap adjacent rows and renumber. `position` is not unique in the
  // database, so the swap cannot trip a constraint mid-move.
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(renumber(next));
  };

  return (
    <div className="space-y-2">
      {rows.map((entry, i) => {
        const name = rowName(entry, i);
        const dateInvalid = !isValidReleaseDate(entry.acquired_date);
        return (
          <div
            key={entry.system_id || i}
            className="flex gap-1.5 items-start"
          >
            <div className="flex flex-col shrink-0 pt-2">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Move ${name} up`}
                className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
              >
                <i className="fas fa-chevron-up text-[9px]" />
              </button>
              <button
                type="button"
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${name} down`}
                className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
              >
                <i className="fas fa-chevron-down text-[9px]" />
              </button>
            </div>

            {/* The fields wrap among themselves; the reorder rail and
                the remove button sit outside the wrapping group, so a row
                too wide for its container squeezes the remark onto its own
                line instead of pushing the remove button off the row. */}
            <div className="flex flex-wrap gap-1.5 items-center flex-1 min-w-0">
              <Select
                label={`Storefront for ${name}`}
                value={entry.storefront}
                options={GAME_STOREFRONTS}
                onChange={(v) => updateEntry(i, "storefront", v)}
              />
              <Select
                label={`Ownership for ${name}`}
                value={entry.ownership}
                options={GAME_OWNERSHIP_KINDS}
                onChange={(v) => updateEntry(i, "ownership", v)}
                className={smallSelectCls}
              />
              <Select
                label={`Format for ${name}`}
                value={entry.copy_format}
                options={GAME_COPY_FORMATS}
                onChange={(v) => updateEntry(i, "copy_format", v)}
                className={smallSelectCls}
              />
              <Select
                label={`Acquisition for ${name}`}
                value={entry.acquisition}
                options={GAME_ACQUISITION_KINDS}
                onChange={(v) => updateEntry(i, "acquisition", v)}
                className={smallSelectCls}
              />

              <input
                className={priceCls}
                type="number"
                step="any"
                placeholder="paid"
                aria-label={`Price paid for ${name}`}
                value={entry.price_paid ?? ""}
                onChange={(e) => updateEntry(i, "price_paid", e.target.value)}
              />
              <Select
                label={`Currency for ${name}`}
                value={entry.price_currency}
                options={PRICE_CURRENCIES}
                onChange={(v) => updateEntry(i, "price_currency", v)}
                className={priceCls}
              />

              {/* Free text, not <input type="date">: acquired_date carries the
                  same year-only / month-only precision release_date does. */}
              <input
                className={
                  dateInvalid
                    ? `${dateCls} border-danger accent-danger focus:ring-danger`
                    : dateCls
                }
                placeholder="2024-05-17"
                aria-label={`Acquired date for ${name}`}
                value={entry.acquired_date ?? ""}
                onChange={(e) => updateEntry(i, "acquired_date", e.target.value)}
              />

              <input
                className={remarkCls}
                placeholder="Remark"
                aria-label={`Remark for ${name}`}
                value={entry.remark ?? ""}
                onChange={(e) => updateEntry(i, "remark", e.target.value)}
              />
            </div>

            <button
              type="button"
              className="text-danger/70 hover:text-danger px-1 shrink-0 pt-2.5"
              aria-label={`Remove ${name}`}
              onClick={() => removeEntry(i)}
            >
              <i className="fas fa-times" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="text-xs text-brand hover:underline mt-1"
        onClick={addEntry}
      >
        + Add copy
      </button>
    </div>
  );
}
