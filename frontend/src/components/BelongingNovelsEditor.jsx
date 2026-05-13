const baseCls =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-white";
const keyInputCls = baseCls + " w-20 shrink-0";
const nameInputCls = baseCls + " flex-1 min-w-0";

export default function BelongingNovelsEditor({ items, onChange, label, placeholder }) {
  const addEntry = () => {
    const nextKey = String(
      items.reduce((max, e) => {
        const n = parseInt(e.key, 10);
        return !isNaN(n) ? Math.max(max, n) : max;
      }, 0) + 1,
    );
    onChange([...items, { key: nextKey, name: "" }]);
  };

  const removeEntry = (i) => onChange(items.filter((_, j) => j !== i));

  const updateEntry = (i, field, value) =>
    onChange(items.map((x, j) => (j === i ? { ...x, [field]: value } : x)));

  const moveUp = (i) => {
    if (i === 0) return;
    const next = [...items];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  };

  const moveDown = (i) => {
    if (i === items.length - 1) return;
    const next = [...items];
    [next[i + 1], next[i]] = [next[i], next[i + 1]];
    onChange(next);
  };

  return (
    <div>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="space-y-2">
        {items.map((entry, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <div className="flex flex-col shrink-0">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => moveUp(i)}
                className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none px-0.5"
              >
                <i className="fas fa-chevron-up text-[9px]" />
              </button>
              <button
                type="button"
                disabled={i === items.length - 1}
                onClick={() => moveDown(i)}
                className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none px-0.5"
              >
                <i className="fas fa-chevron-down text-[9px]" />
              </button>
            </div>
            <input
              className={keyInputCls}
              placeholder="#"
              value={entry.key}
              onChange={(e) => updateEntry(i, "key", e.target.value)}
            />
            <input
              className={nameInputCls}
              placeholder={placeholder}
              value={entry.name}
              onChange={(e) => updateEntry(i, "name", e.target.value)}
            />
            <button
              type="button"
              className="text-red-400 hover:text-red-600 px-1 shrink-0"
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
          + Add Entry
        </button>
      </div>
    </div>
  );
}
