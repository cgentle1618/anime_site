// Frontend: modify tab page file for CollectionModifyTab.
import { getDisplayName } from "../../utils/media";
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

export default function CollectionModifyTab({
  cf,
  uf,
  allFranchises,
  editingItem,
}) {
  const collectionId = editingItem?.system_id;

  // The cover is chosen from the collection's member franchises, not from
  // every entry underneath them - a short, meaningful list.
  const memberFranchises = (allFranchises || [])
    .filter((f) => f.collection_id === collectionId)
    .sort((a, b) =>
      getDisplayName(a, "franchise").localeCompare(
        getDisplayName(b, "franchise"),
      ),
    );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <SectionHeader icon="fa-boxes-stacked" title="Titles & Naming" />
      <Field label="Collection Name EN">
        <input
          className={inputCls}
          value={cf.collection_name_en}
          onChange={(e) => uf("collection_name_en", e.target.value)}
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

      <SectionHeader icon="fa-image" title="Cover" />
      <Field label="Main Cover">
        <select
          className={selectCls}
          value={cf.cover_franchise_id || ""}
          onChange={(e) => uf("cover_franchise_id", e.target.value || null)}
        >
          <option value="">— Auto (from first member) —</option>
          {memberFranchises.map((f) => (
            <option key={f.system_id} value={f.system_id}>
              {getDisplayName(f, "franchise")}
            </option>
          ))}
        </select>
        {memberFranchises.length === 0 && (
          <p className="text-xs text-gray-400 mt-1">
            No franchises assigned to this collection yet. Assign one from the
            Franchise tab first.
          </p>
        )}
      </Field>

      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={cf.remark}
          onChange={(e) => uf("remark", e.target.value)}
        />
      </Field>
    </div>
  );
}
