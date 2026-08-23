// Frontend: modify tab page file for SeriesModifyTab.
import ComboBox from "../../components/forms/ComboBox";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
} from "../../components/forms/FormField";

export default function SeriesModifyTab({
  sf,
  us,
  franchiseItems,
  franchiseCollections,
}) {
  return (
    <>
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
          placeholder="Search or type new franchise..."
          allowNew
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
    </>
  );
}
