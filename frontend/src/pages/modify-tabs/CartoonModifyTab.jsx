// Frontend: modify tab page file for CartoonModifyTab.
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import SourcesEditor from "../../components/forms/SourcesEditor";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, getSourceValues, parseTypes } from "../../utils/media";
import CartoonNotes from "../detail/CartoonNotes";
import {
  CARTOON_AIRING_TYPES,
  AIRING_STATUSES,
  WATCHING_STATUSES,
  IS_MAIN,
  MY_RATINGS,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";

export default function CartoonModifyTab({
  franchiseCollections,
  cmf,
  uc,
  allFranchises,
  seriesItemsForCartoon,
  editingItem,
  sources,
}) {
  return (
    <>
      <SectionHeader icon="fa-paint-brush" title="Titles & Naming" />
      <Field label="Franchise">
        <ComboBox
          items={allFranchises
            .filter(
              (f) =>
                parseTypes(f.franchise_type).includes("Cartoon") ||
                !f.franchise_type,
            )
            .map((f) => ({
              id: f.system_id,
              label: getDisplayName(f, "franchise"),
              searchText: [
                f.franchise_name_cn,
                f.franchise_name_en,
                f.franchise_name_alt,
              ]
                .filter(Boolean)
                .join(" "),
            }))}
          selectedId={cmf.franchise_id}
          inputText={cmf.franchise_text || ""}
          onSelect={(id, label) => {
            uc("franchise_id", id);
            uc("franchise_text", label);
            uc("series_id", null);
            uc("series_text", "");
          }}
          onType={(text) => {
            uc("franchise_text", text);
            uc("franchise_id", null);
            uc("series_id", null);
            uc("series_text", "");
          }}
          onClear={() => {
            uc("franchise_id", null);
            uc("franchise_text", "");
            uc("series_id", null);
            uc("series_text", "");
          }}
          placeholder="Search franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={cmf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForCartoon}
          selectedId={cmf.series_id}
          inputText={cmf.series_text || ""}
          onSelect={(id, label) => {
            uc("series_id", id);
            uc("series_text", label);
          }}
          onType={(text) => {
            uc("series_text", text);
            uc("series_id", null);
          }}
          onClear={() => {
            uc("series_id", null);
            uc("series_text", "");
          }}
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
      <Field label="Cartoon Name CN">
        <input
          className={inputCls}
          value={cmf.cartoon_name_cn || ""}
          onChange={(e) => uc("cartoon_name_cn", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Cartoon Name EN">
          <input
            className={inputCls}
            value={cmf.cartoon_name_en || ""}
            onChange={(e) => uc("cartoon_name_en", e.target.value)}
          />
        </Field>
        <Field label="Cartoon Name Alt">
          <input
            className={inputCls}
            value={cmf.cartoon_name_alt || ""}
            onChange={(e) => uc("cartoon_name_alt", e.target.value)}
          />
        </Field>
        <Field label="Season" hint="e.g. Season 1">
          <input
            className={inputCls}
            value={cmf.season_part || ""}
            onChange={(e) => uc("season_part", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status & Classification" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Airing Type">
          <select
            className={selectCls}
            value={cmf.airing_type || ""}
            onChange={(e) => uc("airing_type", e.target.value)}
          >
            <option value="">—</option>
            {CARTOON_AIRING_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Airing Status">
          <select
            className={selectCls}
            value={cmf.airing_status || ""}
            onChange={(e) => uc("airing_status", e.target.value)}
          >
            <option value="">—</option>
            {AIRING_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Watching Status">
          <select
            className={selectCls}
            value={cmf.watching_status}
            onChange={(e) => uc("watching_status", e.target.value)}
          >
            <StatusOptions statuses={WATCHING_STATUSES} />
          </select>
        </Field>
        <Field label="Is Main">
          <select
            className={selectCls}
            value={cmf.is_main || ""}
            onChange={(e) => uc("is_main", e.target.value)}
          >
            <option value="">—</option>
            {IS_MAIN.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={cmf.my_rating || ""}
            onChange={(e) => uc("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {MY_RATINGS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Episodes Total">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={cmf.ep_total ?? ""}
            onChange={(e) => uc("ep_total", e.target.value)}
          />
        </Field>
        <Field label="Episodes Finished">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={cmf.ep_fin ?? ""}
            onChange={(e) => uc("ep_fin", e.target.value)}
          />
        </Field>
        <Field label="Ep Length (min)">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={cmf.length_ep_min ?? ""}
            onChange={(e) => uc("length_ep_min", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Original Source">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "option",
              category: "Platform",
              scope: "cartoon",
              usage: "origin",
            })}
            value={cmf.original_source || ""}
            onChange={(v) => uc("original_source", v)}
            placeholder="e.g. Disney+"
          />
        </Field>
        <Field label="Release Date" hint="e.g. SEP 2024">
          <input
            className={inputCls}
            value={cmf.release_date || ""}
            onChange={(e) => uc("release_date", e.target.value)}
            placeholder="SEP 2024"
          />
        </Field>
        <Field label="IMDb Rating" hint="e.g. 9.2">
          <input
            className={inputCls}
            value={cmf.imdb_rating || ""}
            onChange={(e) => uc("imdb_rating", e.target.value)}
            placeholder="9.2"
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Watch Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!cmf.watch_next}
              onChange={(e) => uc("watch_next", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
              Add to Watch Next list
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="IMDb & Sources" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="IMDb ID">
          <input
            className={inputCls}
            type="text"
            value={cmf.imdb_id ?? ""}
            onChange={(e) => uc("imdb_id", e.target.value)}
            placeholder="tt1234567"
          />
        </Field>
        <Field label="IMDb Link">
          <input
            className={inputCls}
            type="url"
            value={cmf.imdb_link || ""}
            onChange={(e) => uc("imdb_link", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-broadcast-tower" title="Sources" />
      <SourcesEditor
        value={cmf.sources}
        onChange={(rows) => uc("sources", rows)}
        mediaType="cartoon"
        sources={sources}
      />

      <SectionHeader icon="fa-sticky-note" title="Notes" />
      <Field label="Cover Image File" hint="e.g. 5114.jpg">
        <input
          className={inputCls}
          value={cmf.cover_image_file || ""}
          onChange={(e) => uc("cover_image_file", e.target.value)}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={cmf.remark || ""}
          onChange={(e) => uc("remark", e.target.value)}
        />
      </Field>
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the dedicated Remark field above edits the
          same singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <CartoonNotes
        cartoon={{ system_id: editingItem?.system_id }}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
