// Frontend: form component for a novel's units (volumes, arcs, stories).
import { kindsForType, unitDisplayKey } from "../../lib/novelUnits";

const baseCls =
  "border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface";
const keyInputCls = baseCls + " w-24 shrink-0";
const nameInputCls = baseCls + " flex-1 min-w-0";
const numInputCls = baseCls + " w-24 shrink-0";
const kindSelectCls = baseCls + " w-28 shrink-0";

export default function NovelUnitsEditor({ items, novelType, onChange }) {
  const kinds = kindsForType(novelType);
  const rows = items || [];

  const addEntry = () =>
    onChange([
      ...rows,
      {
        unit_kind: kinds[0],
        position: rows.length + 1,
        unit_key: "",
        name_cn: "",
        name_en: "",
        remark: "",
        ch_count: "",
      },
    ]);

  const removeEntry = (i) =>
    onChange(rows.filter((_, j) => j !== i).map((r, j) => ({ ...r, position: j + 1 })));

  const updateEntry = (i, field, value) =>
    onChange(rows.map((x, j) => (j === i ? { ...x, [field]: value } : x)));

  // Swap adjacent rows and renumber. position is not unique in the database
  // precisely so this swap cannot trip a constraint mid-move.
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next.map((r, k) => ({ ...r, position: k + 1 })));
  };

  return (
    <div className="space-y-2">
      {rows.map((entry, i) => (
        <div key={entry.system_id || i} className="flex gap-1.5 items-center">
          <div className="flex flex-col shrink-0">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label="Move up"
              className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
            >
              <i className="fas fa-chevron-up text-[9px]" />
            </button>
            <button
              type="button"
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Move down"
              className="text-text-faint/60 hover:text-text-faint disabled:opacity-20 leading-none px-0.5"
            >
              <i className="fas fa-chevron-down text-[9px]" />
            </button>
          </div>

          {kinds.length > 1 ? (
            <select
              className={kindSelectCls}
              value={entry.unit_kind}
              onChange={(e) => updateEntry(i, "unit_kind", e.target.value)}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          ) : null}

          <input
            className={keyInputCls}
            placeholder={unitDisplayKey(entry.unit_kind, entry.position, null)}
            value={entry.unit_key || ""}
            onChange={(e) => updateEntry(i, "unit_key", e.target.value)}
          />
          <input
            className={nameInputCls}
            placeholder="CN name"
            value={entry.name_cn || ""}
            onChange={(e) => updateEntry(i, "name_cn", e.target.value)}
          />
          <input
            className={nameInputCls}
            placeholder="EN name"
            value={entry.name_en || ""}
            onChange={(e) => updateEntry(i, "name_en", e.target.value)}
          />
          <input
            className={nameInputCls}
            placeholder="Remark"
            value={entry.remark || ""}
            onChange={(e) => updateEntry(i, "remark", e.target.value)}
          />
          {entry.unit_kind === "arc" ? (
            <input
              className={numInputCls}
              type="number"
              step="any"
              placeholder="chapters"
              value={entry.ch_count ?? ""}
              onChange={(e) => updateEntry(i, "ch_count", e.target.value)}
            />
          ) : null}

          <button
            type="button"
            className="text-danger/70 hover:text-danger px-1 shrink-0"
            aria-label="Remove"
            onClick={() => removeEntry(i)}
          >
            <i className="fas fa-times" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-brand hover:underline mt-1"
        onClick={addEntry}
      >
        + Add {kinds.length > 1 ? "unit" : kinds[0]}
      </button>
    </div>
  );
}
