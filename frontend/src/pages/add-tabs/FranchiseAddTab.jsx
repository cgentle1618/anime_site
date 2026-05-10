import { parseTypes } from "../../utils/anime";
import { Field, SectionHeader, inputCls, selectCls } from "../../components/FormField";

export default function FranchiseAddTab({ ff, uf }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-sitemap" title="Titles & Naming" />
      <Field label="Franchise Name EN">
        <input
          className={inputCls}
          value={ff.franchise_name_en}
          onChange={(e) => uf("franchise_name_en", e.target.value)}
          placeholder="English franchise name"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Franchise Name CN">
          <input
            className={inputCls}
            value={ff.franchise_name_cn}
            onChange={(e) => uf("franchise_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Franchise Name roman">
          <input
            className={inputCls}
            value={ff.franchise_name_roman}
            onChange={(e) => uf("franchise_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Franchise Name JP">
          <input
            className={inputCls}
            value={ff.franchise_name_jp}
            onChange={(e) => uf("franchise_name_jp", e.target.value)}
          />
        </Field>
        <Field label="Franchise Name Alt">
          <input
            className={inputCls}
            value={ff.franchise_name_alt}
            onChange={(e) => uf("franchise_name_alt", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-info-circle" title="Other Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Franchise Type">
          <div className="flex flex-wrap gap-3">
            {[
              "ACG",
              "Anime Movie",
              "TV",
              "Movie",
              "Cartoon",
              "Novel",
            ].map((v) => {
              const types = parseTypes(ff.franchise_type);
              const checked = types.includes(v);
              return (
                <label
                  key={v}
                  className="flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? types.filter((t) => t !== v)
                        : [...types, v];
                      uf("franchise_type", next.join(", "));
                    }}
                    className="rounded accent-brand"
                  />
                  {v}
                </label>
              );
            })}
          </div>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={ff.my_rating}
            onChange={(e) => uf("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expectation">
          <select
            className={selectCls}
            value={ff.franchise_expectation}
            onChange={(e) => uf("franchise_expectation", e.target.value)}
          >
            <option value="">—</option>
            {["Highest", "High", "Medium", "Low"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Favorite 3x3 Slot" hint="1–9">
          <select
            className={selectCls}
            value={ff.favorite_3x3_slot}
            onChange={(e) => uf("favorite_3x3_slot", e.target.value)}
          >
            <option value="">—</option>
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={ff.remark}
          onChange={(e) => uf("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}
