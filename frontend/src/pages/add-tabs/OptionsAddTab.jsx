import { Field, SectionHeader, inputCls } from "../../components/forms/FormField";

export default function OptionsAddTab({
  optCategory,
  setOptCategory,
  optValues,
  setOptValues,
  optionCategories,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-cog" title="System Option" />
      <Field label="Category" required>
        <input
          className={inputCls}
          value={optCategory}
          onChange={(e) => setOptCategory(e.target.value)}
          placeholder="e.g. Studio, Genre Main, Director..."
          list="opt-categories"
        />
        <datalist id="opt-categories">
          {[
            ...new Set([
              "Studio",
              "Distributor TW",
              "Manga Publisher TW",
              "Director",
              "Producer",
              "Music / Composer",
              "Genre Main",
              "Genre Sub",
              ...optionCategories,
            ]),
          ].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <div className="space-y-2">
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          Option Values
        </label>
        {optValues.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={inputCls}
              value={v}
              onChange={(e) =>
                setOptValues((prev) =>
                  prev.map((x, j) => (j === i ? e.target.value : x)),
                )
              }
              placeholder={`Value ${i + 1}`}
            />
            {optValues.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setOptValues((prev) => prev.filter((_, j) => j !== i))
                }
                className="px-3 py-2 text-red-400 hover:text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition shrink-0"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOptValues((prev) => [...prev, ""])}
          className="text-xs font-bold text-brand hover:text-brand-hover flex items-center gap-1.5 py-1"
        >
          <i className="fas fa-plus-circle"></i> Add Another Entry
        </button>
      </div>
    </div>
  );
}
