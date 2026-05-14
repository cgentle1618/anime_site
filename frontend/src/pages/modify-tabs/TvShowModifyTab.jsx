import ComboBox from "../../components/forms/ComboBox";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, parseTypes } from "../../utils/media";
import TVShowNotes from "../TVShowNotes";

export default function TvShowModifyTab({
  tvmf,
  utv,
  allFranchises,
  seriesItemsForTvShow,
  editingItem,
}) {
  return (
    <>
      <SectionHeader icon="fa-video" title="Titles & Naming" />
      <Field label="Franchise">
        <ComboBox
          items={allFranchises
            .filter(
              (f) =>
                parseTypes(f.franchise_type).includes("TV") ||
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
          selectedId={tvmf.franchise_id}
          inputText={tvmf.franchise_text || ""}
          onSelect={(id, label) => {
            utv("franchise_id", id);
            utv("franchise_text", label);
            utv("series_id", null);
            utv("series_text", "");
          }}
          onType={(text) => {
            utv("franchise_text", text);
            utv("franchise_id", null);
            utv("series_id", null);
            utv("series_text", "");
          }}
          onClear={() => {
            utv("franchise_id", null);
            utv("franchise_text", "");
            utv("series_id", null);
            utv("series_text", "");
          }}
          placeholder="Search franchise..."
          allowNew
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForTvShow}
          selectedId={tvmf.series_id}
          inputText={tvmf.series_text || ""}
          onSelect={(id, label) => {
            utv("series_id", id);
            utv("series_text", label);
          }}
          onType={(text) => {
            utv("series_text", text);
            utv("series_id", null);
          }}
          onClear={() => {
            utv("series_id", null);
            utv("series_text", "");
          }}
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
      <Field label="TV Name CN">
        <input
          className={inputCls}
          value={tvmf.tv_name_cn || ""}
          onChange={(e) => utv("tv_name_cn", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="TV Name EN">
          <input
            className={inputCls}
            value={tvmf.tv_name_en || ""}
            onChange={(e) => utv("tv_name_en", e.target.value)}
          />
        </Field>
        <Field label="TV Name Alt">
          <input
            className={inputCls}
            value={tvmf.tv_name_alt || ""}
            onChange={(e) => utv("tv_name_alt", e.target.value)}
          />
        </Field>
        <Field label="Season" hint="e.g. Season 1">
          <input
            className={inputCls}
            value={tvmf.season_part || ""}
            onChange={(e) => utv("season_part", e.target.value)}
          />
        </Field>
        <Field label="Region">
          <select
            className={selectCls}
            value={tvmf.region || ""}
            onChange={(e) => utv("region", e.target.value)}
          >
            <option value="">—</option>
            {["歐美劇", "韓劇", "日劇", "陸劇", "台劇", "動畫"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status & Classification" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Airing Status">
          <select
            className={selectCls}
            value={tvmf.airing_status || ""}
            onChange={(e) => utv("airing_status", e.target.value)}
          >
            <option value="">—</option>
            {["Not Yet Aired", "Airing", "Finished Airing"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Watching Status">
          <select
            className={selectCls}
            value={tvmf.watching_status || "Might Watch"}
            onChange={(e) => utv("watching_status", e.target.value)}
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
            value={tvmf.is_main || ""}
            onChange={(e) => utv("is_main", e.target.value)}
          >
            <option value="">—</option>
            {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
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
            value={tvmf.ep_total ?? ""}
            onChange={(e) => utv("ep_total", e.target.value)}
          />
        </Field>
        <Field label="Episodes Finished">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={tvmf.ep_fin ?? ""}
            onChange={(e) => utv("ep_fin", e.target.value)}
          />
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={tvmf.my_rating || ""}
            onChange={(e) => utv("my_rating", e.target.value)}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Official Source">
          <input
            className={inputCls}
            value={tvmf.source_official || ""}
            onChange={(e) => utv("source_official", e.target.value)}
            placeholder="e.g. Netflix"
          />
        </Field>
        <Field label="Release Date" hint="e.g. FEB 2026">
          <input
            className={inputCls}
            value={tvmf.release_date || ""}
            onChange={(e) => utv("release_date", e.target.value)}
            placeholder="FEB 2026"
          />
        </Field>
        <Field label="IMDB Rating" hint="e.g. 9.2">
          <input
            className={inputCls}
            value={tvmf.imdb_rating || ""}
            onChange={(e) => utv("imdb_rating", e.target.value)}
            placeholder="9.2"
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Watch Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!tvmf.watch_next}
              onChange={(e) => utv("watch_next", e.target.checked)}
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
              checked={!!tvmf.to_rewatch}
              onChange={(e) => utv("to_rewatch", e.target.checked)}
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
            value={tvmf.prequel_id || ""}
            onChange={(e) => utv("prequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Sequel ID" hint="UUID of sequel entry">
          <input
            className={inputCls + " font-mono text-xs"}
            value={tvmf.sequel_id || ""}
            onChange={(e) => utv("sequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Watch Order" hint="e.g. 1, 1.5, 2">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={tvmf.watch_order}
            onChange={(e) => utv("watch_order", e.target.value)}
            placeholder="e.g. 1, 1.5, 2"
          />
        </Field>
        <Field
          label="Derive Related"
          hint="Set to No to skip prequel/sequel derivation"
        >
          <select
            className={selectCls}
            value={tvmf.derive_related}
            onChange={(e) => utv("derive_related", e.target.value)}
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
            value={tvmf.imdb_id ?? ""}
            onChange={(e) => utv("imdb_id", e.target.value)}
            placeholder="tt1234567"
          />
        </Field>
        <Field label="IMDb Link">
          <input
            className={inputCls}
            type="url"
            value={tvmf.imdb_link || ""}
            onChange={(e) => utv("imdb_link", e.target.value)}
          />
        </Field>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
            Other Sources
          </label>
          <div className="space-y-2">
            {(tvmf.source_other || []).map((entry, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className={inputCls}
                  placeholder="Source name (e.g. Disney+)"
                  value={entry.name}
                  onChange={(e) =>
                    utv(
                      "source_other",
                      tvmf.source_other.map((x, j) =>
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
                    utv(
                      "source_other",
                      tvmf.source_other.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="text-red-400 hover:text-red-600 px-1 shrink-0"
                  onClick={() =>
                    utv(
                      "source_other",
                      tvmf.source_other.filter((_, j) => j !== i),
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
                utv("source_other", [
                  ...(tvmf.source_other || []),
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
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={tvmf.remark || ""}
          onChange={(e) => utv("remark", e.target.value)}
        />
      </Field>
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      <TVShowNotes
        show={{
          notes: tvmf.notes,
          system_id: editingItem?.system_id,
        }}
        isAdmin={true}
        onSave={(updatedNotes) => utv("notes", updatedNotes)}
      />
    </>
  );
}
