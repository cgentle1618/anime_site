// Frontend: add tab page file for CollectionAddTab.
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import {
  FRANCHISE_EXPECTATIONS,
  MY_RATINGS,
} from "../../config/fieldOptions";

export { defaultCollection } from "../../config/formFactories";

export default function CollectionAddTab({ cf, uf }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-boxes-stacked" title="Titles & Naming" />
      <Field label="Collection Name EN">
        <input
          className={inputCls}
          value={cf.collection_name_en}
          onChange={(e) => uf("collection_name_en", e.target.value)}
          placeholder="e.g. Marvel, Type-Moon"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Collection Name CN">
          <input
            className={inputCls}
            value={cf.collection_name_cn}
            onChange={(e) => uf("collection_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Collection Name roman">
          <input
            className={inputCls}
            value={cf.collection_name_roman}
            onChange={(e) => uf("collection_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Collection Name JP">
          <input
            className={inputCls}
            value={cf.collection_name_jp}
            onChange={(e) => uf("collection_name_jp", e.target.value)}
          />
        </Field>
        <Field label="Collection Name Alt">
          <input
            className={inputCls}
            value={cf.collection_name_alt}
            onChange={(e) => uf("collection_name_alt", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-info-circle" title="Other Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={cf.my_rating}
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
            value={cf.collection_expectation}
            onChange={(e) => uf("collection_expectation", e.target.value)}
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
          value={cf.remark}
          onChange={(e) => uf("remark", e.target.value)}
        />
      </Field>

      <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
        <i className="fas fa-info-circle mr-1"></i>
        A Collection groups related franchises. Assign franchises to it from the
        Franchise tab — the cover is then taken from a member franchise.
      </p>
    </div>
  );
}
