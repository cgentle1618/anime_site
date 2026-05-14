import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, getOptions, parseTypes } from "../../utils/media";
import MangaNotes from "../MangaNotes";

export default function MangaModifyTab({
  cmgf,
  umg,
  allFranchises,
  seriesItemsForManga,
  editingItem,
  ribbonSection,
  allOptions,
}) {
  return (
    <>
      {ribbonSection}

      <SectionHeader icon="fa-book" title="Titles & Naming" />
      <Field label="Franchise">
        <ComboBox
          items={allFranchises
            .filter(
              (f) =>
                parseTypes(f.franchise_type).includes("ACG") ||
                parseTypes(f.franchise_type).includes("Manga") ||
                !f.franchise_type,
            )
            .map((f) => ({
              id: f.system_id,
              label: getDisplayName(f, "franchise"),
              searchText: [
                f.franchise_name_cn,
                f.franchise_name_en,
                f.franchise_name_jp,
                f.franchise_name_roman,
                f.franchise_name_alt,
              ]
                .filter(Boolean)
                .join(" "),
            }))}
          selectedId={cmgf.franchise_id}
          inputText={cmgf.franchise_text || ""}
          onSelect={(id, label) => {
            umg("franchise_id", id);
            umg("franchise_text", label);
            umg("series_id", null);
            umg("series_text", "");
          }}
          onType={(text) => {
            umg("franchise_text", text);
            umg("franchise_id", null);
            umg("series_id", null);
            umg("series_text", "");
          }}
          onClear={() => {
            umg("franchise_id", null);
            umg("franchise_text", "");
            umg("series_id", null);
            umg("series_text", "");
          }}
          placeholder="Search franchise..."
          allowNew
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForManga}
          selectedId={cmgf.series_id}
          inputText={cmgf.series_text || ""}
          onSelect={(id, label) => {
            umg("series_id", id);
            umg("series_text", label);
          }}
          onType={(text) => {
            umg("series_text", text);
            umg("series_id", null);
          }}
          onClear={() => {
            umg("series_id", null);
            umg("series_text", "");
          }}
          placeholder="Search series..."
          allowNew
        />
      </Field>
      <Field label="Manga Name CN">
        <input
          className={inputCls}
          value={cmgf.manga_name_cn || ""}
          onChange={(e) => umg("manga_name_cn", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Manga Name EN">
          <input
            className={inputCls}
            value={cmgf.manga_name_en || ""}
            onChange={(e) => umg("manga_name_en", e.target.value)}
          />
        </Field>
        <Field label="Manga Name Alt">
          <input
            className={inputCls}
            value={cmgf.manga_name_alt || ""}
            onChange={(e) => umg("manga_name_alt", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Manga Name Roman">
          <input
            className={inputCls}
            value={cmgf.manga_name_roman || ""}
            onChange={(e) => umg("manga_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Manga Name JP">
          <input
            className={inputCls}
            value={cmgf.manga_name_jp || ""}
            onChange={(e) => umg("manga_name_jp", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Region">
          <select
            className={selectCls}
            value={cmgf.region || ""}
            onChange={(e) => umg("region", e.target.value)}
          >
            <option value="">—</option>
            {["日漫", "韓漫", "國漫", "台漫", "其他"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Is Main">
          <select
            className={selectCls}
            value={cmgf.is_main || ""}
            onChange={(e) => umg("is_main", e.target.value)}
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

      <SectionHeader icon="fa-chart-bar" title="Status" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Serialization Status">
          <select
            className={selectCls}
            value={cmgf.serialization_status || ""}
            onChange={(e) => umg("serialization_status", e.target.value)}
          >
            <option value="">—</option>
            {["連載中", "停更", "腰斬", "完結"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reading Status">
          <select
            className={selectCls}
            value={cmgf.reading_status || "Might Read"}
            onChange={(e) => umg("reading_status", e.target.value)}
          >
            {[
              "Might Read",
              "Plan to Read",
              "Active Reading",
              "Passive Reading",
              "Paused",
              "Completed",
              "Temp Dropped",
              "Dropped",
              "Won't Read",
            ].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={cmgf.my_rating || ""}
            onChange={(e) => umg("my_rating", e.target.value)}
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

      <SectionHeader icon="fa-list-ol" title="Progress" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Ch Total">
          <input
            className={inputCls}
            type="number"
            value={cmgf.ch_total ?? ""}
            onChange={(e) => umg("ch_total", e.target.value)}
          />
        </Field>
        <Field label="Ch Finished">
          <input
            className={inputCls}
            type="number"
            value={cmgf.ch_fin ?? ""}
            onChange={(e) => umg("ch_fin", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Vol Total">
          <input
            className={inputCls}
            type="number"
            value={cmgf.vol_total ?? ""}
            onChange={(e) => umg("vol_total", e.target.value)}
          />
        </Field>
        <Field label="Vol Finished">
          <input
            className={inputCls}
            type="number"
            value={cmgf.vol_fin ?? ""}
            onChange={(e) => umg("vol_fin", e.target.value)}
          />
        </Field>
        <Field label="Vol Fin Page">
          <input
            className={inputCls}
            type="number"
            value={cmgf.vol_fin_page ?? ""}
            onChange={(e) => umg("vol_fin_page", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-star" title="Scores" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="MAL Rating">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={cmgf.mal_rating ?? ""}
            onChange={(e) => umg("mal_rating", e.target.value)}
          />
        </Field>
        <Field label="MAL Rank">
          <input
            className={inputCls}
            type="number"
            value={cmgf.mal_rank ?? ""}
            onChange={(e) => umg("mal_rank", e.target.value)}
          />
        </Field>
        <Field label="AniList Rating">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={cmgf.anilist_rating ?? ""}
            onChange={(e) => umg("anilist_rating", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-pen-nib" title="Authors & Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Author (Plot)">
          <MultiSelect
            options={getOptions(allOptions, "Manga Author")}
            value={cmgf.author_plot}
            onChange={(v) => umg("author_plot", v)}
            placeholder="Select plot author..."
          />
        </Field>
        <Field label="Author (Art)">
          <MultiSelect
            options={getOptions(allOptions, "Manga Author")}
            value={cmgf.author_draw}
            onChange={(v) => umg("author_draw", v)}
            placeholder="Select art author..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Release Year">
          <input
            className={inputCls}
            type="number"
            value={cmgf.release_year ?? ""}
            onChange={(e) => umg("release_year", e.target.value)}
          />
        </Field>
        <Field label="End Year">
          <input
            className={inputCls}
            type="number"
            value={cmgf.end_year ?? ""}
            onChange={(e) => umg("end_year", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Anime Studio">
          <MultiSelect
            options={getOptions(allOptions, "Studio")}
            value={cmgf.anime_studio}
            onChange={(v) => umg("anime_studio", v)}
            placeholder="Select studio..."
          />
        </Field>
        <Field label="Serialization Platform">
          <input
            className={inputCls}
            value={cmgf.serialization_platform || ""}
            onChange={(e) => umg("serialization_platform", e.target.value)}
          />
        </Field>
        <Field label="Publisher TW">
          <MultiSelect
            options={getOptions(allOptions, "Manga Publisher TW")}
            value={cmgf.publisher_tw}
            onChange={(v) => umg("publisher_tw", v)}
            placeholder="Select publisher..."
          />
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Prequel ID">
          <input
            className={inputCls + " font-mono text-xs"}
            value={cmgf.prequel_id || ""}
            onChange={(e) => umg("prequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Sequel ID">
          <input
            className={inputCls + " font-mono text-xs"}
            value={cmgf.sequel_id || ""}
            onChange={(e) => umg("sequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Watch Order">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={cmgf.watch_order ?? ""}
            onChange={(e) => umg("watch_order", e.target.value)}
          />
        </Field>
        <Field label="Derive Related">
          <select
            className={selectCls}
            value={cmgf.derive_related || ""}
            onChange={(e) => umg("derive_related", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Field>
      </div>

      <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="MAL ID">
          <input
            className={inputCls}
            type="number"
            value={cmgf.mal_id ?? ""}
            onChange={(e) => umg("mal_id", e.target.value)}
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            type="url"
            value={cmgf.mal_link || ""}
            onChange={(e) => umg("mal_link", e.target.value)}
          />
        </Field>
        <Field label="AniList Link">
          <input
            className={inputCls}
            type="url"
            value={cmgf.anilist_link || ""}
            onChange={(e) => umg("anilist_link", e.target.value)}
          />
        </Field>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          Other Sources
        </label>
        <div className="space-y-2">
          {(cmgf.source_other || []).map((entry, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls}
                placeholder="Source name"
                value={entry.name}
                onChange={(e) =>
                  umg(
                    "source_other",
                    (cmgf.source_other || []).map((x, j) =>
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
                  umg(
                    "source_other",
                    (cmgf.source_other || []).map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="text-red-400 hover:text-red-600 px-1 shrink-0"
                onClick={() =>
                  umg(
                    "source_other",
                    (cmgf.source_other || []).filter((_, j) => j !== i),
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
              umg("source_other", [
                ...(cmgf.source_other || []),
                { name: "", url: "" },
              ])
            }
          >
            + Add Source
          </button>
        </div>
      </div>

      <SectionHeader icon="fa-flag" title="Flags" />
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Read Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!cmgf.read_next}
              onChange={(e) => umg("read_next", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
              Add to Read Next list
            </span>
          </label>
        </Field>
        <Field label="To Reread">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!cmgf.to_reread}
              onChange={(e) => umg("to_reread", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
              Mark for reread
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
      <Field label="Cover Image File">
        <input
          className={inputCls}
          value={cmgf.cover_image_file || ""}
          onChange={(e) => umg("cover_image_file", e.target.value)}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={cmgf.remark || ""}
          onChange={(e) => umg("remark", e.target.value)}
        />
      </Field>
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      <MangaNotes
        manga={{
          notes: cmgf.notes,
          system_id: editingItem?.system_id,
        }}
        isAdmin={true}
        onSave={(updatedNotes) => umg("notes", updatedNotes)}
      />
    </>
  );
}
