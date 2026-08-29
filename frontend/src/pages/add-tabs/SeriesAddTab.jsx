// Frontend: add tab page file for SeriesAddTab.
import ComboBox from "../../components/forms/ComboBox";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import {
  MY_RATINGS,
  FRANCHISE_EXPECTATIONS,
} from "../../config/fieldOptions";

export { defaultSeries } from "../../config/formFactories";

export default function SeriesAddTab({
  sf,
  us,
  franchiseItems,
  franchiseCollections,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-layer-group" title="Titles & Naming" />
      <Field label="Parent Franchise" required>
        <ComboBox
          items={franchiseItems}
          selectedId={sf.franchise_id}
          inputText={sf.franchise_text}
          onSelect={(id, label) => {
            us("franchise_id", id);
            us("franchise_text", label);
          }}
          onType={(text) => {
            us("franchise_text", text);
            us("franchise_id", null);
          }}
          onClear={() => {
            us("franchise_id", null);
            us("franchise_text", "");
          }}
          placeholder="Search existing franchises..."
        />
        <CollectionNote
          franchiseId={sf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series Name EN">
        <input
          className={inputCls}
          value={sf.series_name_en}
          onChange={(e) => us("series_name_en", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Series Name CN">
          <input
            className={inputCls}
            value={sf.series_name_cn}
            onChange={(e) => us("series_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Series Name roman">
          <input
            className={inputCls}
            value={sf.series_name_roman}
            onChange={(e) => us("series_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Series Name JP">
          <input
            className={inputCls}
            value={sf.series_name_jp}
            onChange={(e) => us("series_name_jp", e.target.value)}
          />
        </Field>
        <Field label="Series Name Alt">
          <input
            className={inputCls}
            value={sf.series_name_alt}
            onChange={(e) => us("series_name_alt", e.target.value)}
          />
        </Field>
      </div>
      <SectionHeader icon="fa-info-circle" title="Other Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={sf.my_rating}
            onChange={(e) => us("my_rating", e.target.value)}
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
            value={sf.series_expectation}
            onChange={(e) => us("series_expectation", e.target.value)}
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
      {/*
        No Main Cover control here: a series that does not exist yet has no
        entries to choose from. It lives on the Modify tab only, exactly as
        franchise does. To Rewatch is absent for the same reason - it targets
        an entry group by system_id, which does not exist until save.
      */}
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={sf.remark}
          onChange={(e) => us("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}
