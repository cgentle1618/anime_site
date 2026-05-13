import ComboBox from "../../components/ComboBox";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/FormField";
import { getDisplayName, parseTypes } from "../../utils/media";
import CartoonNotes from "../CartoonNotes";

export default function CartoonModifyTab({
  cmf,
  uc,
  allFranchises,
  seriesItemsForCartoon,
  editingItem,
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
            {["TV", "Movie", "OVA", "Special"].map((v) => (
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
            {["Not Yet Aired", "Airing", "Finished Airing"].map((v) => (
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
            value={cmf.watching_status || "Might Watch"}
            onChange={(e) => uc("watching_status", e.target.value)}
          >
            {[
              "Might Watch",
              "Plan to Watch",
              "Watch When Airs",
              "Active Watching",
              "Passive Watching",
              "Paused",
              "Completed",
              "Temp Dropped",
              "Dropped",
              "Won't Watch",
            ].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Is Main">
          <select
            className={selectCls}
            value={cmf.is_main || ""}
            onChange={(e) => uc("is_main", e.target.value)}
          >
            <option value="">—</option>
            {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
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
            {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
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
        <Field label="Official Source">
          <input
            className={inputCls}
            value={cmf.source_official || ""}
            onChange={(e) => uc("source_official", e.target.value)}
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
            <span className="text-sm font-medium text-gray-700">
              Add to Watch Next list
            </span>
          </label>
        </Field>
        <Field label="To Rewatch">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!cmf.to_rewatch}
              onChange={(e) => uc("to_rewatch", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
              Mark for rewatch
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Prequel ID" hint="UUID of prequel entry">
          <input
            className={inputCls + " font-mono text-xs"}
            value={cmf.prequel_id || ""}
            onChange={(e) => uc("prequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Sequel ID" hint="UUID of sequel entry">
          <input
            className={inputCls + " font-mono text-xs"}
            value={cmf.sequel_id || ""}
            onChange={(e) => uc("sequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Watch Order" hint="e.g. 1, 1.5, 2">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={cmf.watch_order}
            onChange={(e) => uc("watch_order", e.target.value)}
            placeholder="e.g. 1, 1.5, 2"
          />
        </Field>
        <Field
          label="Derive Related"
          hint="Set to No to skip prequel/sequel derivation"
        >
          <select
            className={selectCls}
            value={cmf.derive_related}
            onChange={(e) => uc("derive_related", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
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
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
            Other Sources
          </label>
          <div className="space-y-2">
            {(cmf.source_other || []).map((entry, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className={inputCls}
                  placeholder="Source name (e.g. Netflix)"
                  value={entry.name}
                  onChange={(e) =>
                    uc(
                      "source_other",
                      cmf.source_other.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  className={inputCls}
                  type="url"
                  placeholder="https://... (optional)"
                  value={entry.url}
                  onChange={(e) =>
                    uc(
                      "source_other",
                      cmf.source_other.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="text-red-400 hover:text-red-600 px-1 shrink-0"
                  onClick={() =>
                    uc(
                      "source_other",
                      cmf.source_other.filter((_, j) => j !== i),
                    )
                  }
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-brand hover:underline mt-1"
              onClick={() =>
                uc("source_other", [
                  ...(cmf.source_other || []),
                  { name: "", url: "" },
                ])
              }
            >
              + Add Source
            </button>
          </div>
        </div>
      </div>

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
      <CartoonNotes
        cartoon={{
          notes: cmf.notes,
          system_id: editingItem?.system_id,
        }}
        isAdmin={true}
        onSave={(updatedNotes) => uc("notes", updatedNotes)}
      />
    </>
  );
}
