import ComboBox from "../../components/forms/ComboBox";
import { Field, SectionHeader, inputCls } from "../../components/forms/FormField";

export const defaultSeries = () => ({
  franchise_id: null,
  franchise_text: "",
  series_name_en: "",
  series_name_cn: "",
  series_name_alt: "",
  remark: "",
});

export default function SeriesAddTab({ sf, us, franchiseItems }) {
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
        <Field label="Series Name Alt">
          <input
            className={inputCls}
            value={sf.series_name_alt}
            onChange={(e) => us("series_name_alt", e.target.value)}
          />
        </Field>
      </div>
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
