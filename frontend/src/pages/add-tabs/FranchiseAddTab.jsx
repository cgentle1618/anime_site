// Frontend: add tab page file for FranchiseAddTab.
import { parseTypes } from "../../utils/media";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ComboBox from "../../components/forms/ComboBox";
import {
  FRANCHISE_EXPECTATIONS,
  FRANCHISE_TYPES,
  MY_RATINGS,
} from "../../config/fieldOptions";

export { defaultFranchise } from "../../config/formFactories";

export default function FranchiseAddTab({ ff, uf, collectionItems }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-4">
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
        <Field label="Collection">
          <ComboBox
            items={collectionItems || []}
            selectedId={ff.collection_id}
            inputText={ff.collection_text}
            onSelect={(id, label) => {
              uf("collection_id", id);
              uf("collection_text", label);
            }}
            onType={(text) => {
              uf("collection_text", text);
              uf("collection_id", null);
            }}
            onClear={() => {
              uf("collection_id", null);
              uf("collection_text", "");
            }}
            placeholder="Search collection (optional)..."
          />
        </Field>
        <Field label="Franchise Type">
          <div className="flex flex-wrap gap-3">
            {FRANCHISE_TYPES.map(
              (v) => {
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
              },
            )}
          </div>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={ff.my_rating}
            onChange={(e) => uf("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {MY_RATINGS.map((v) => (
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
            {FRANCHISE_EXPECTATIONS.map((v) => (
              <option key={v} value={v}>
                {v}
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

