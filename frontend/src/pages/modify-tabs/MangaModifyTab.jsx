// Frontend: modify tab page file for MangaModifyTab.
import ComboBox from "../../components/forms/ComboBox";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import MultiSelect from "../../components/forms/MultiSelect";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, getSourceValues, parseTypes } from "../../utils/media";
import MangaNotes from "../detail/MangaNotes";
import {
  MANGA_REGIONS,
  IS_MAIN,
  MANGA_SERIALIZATION_STATUSES,
  READING_STATUSES,
  MY_RATINGS,
} from "../../config/fieldOptions";

export default function MangaModifyTab({
  franchiseCollections,
  cmgf,
  umg,
  allFranchises,
  seriesItemsForManga,
  editingItem,
  ribbonSection,
  sources,
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
        <CollectionNote
          franchiseId={cmgf.franchise_id}
          franchiseCollections={franchiseCollections}
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
            {MANGA_REGIONS.map((v) => (
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
            {IS_MAIN.map((v) => (
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
            {MANGA_SERIALIZATION_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reading Status">
          <select
            className={selectCls}
            value={cmgf.reading_status}
            onChange={(e) => umg("reading_status", e.target.value)}
          >
            {READING_STATUSES.map((v) => (
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
            {MY_RATINGS.map((v) => (
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
            options={getSourceValues(sources, {
              kind: "person",
              role: "manga_author",
            })}
            value={cmgf.author_plot}
            onChange={(v) => umg("author_plot", v)}
            placeholder="Select plot author..."
          />
        </Field>
        <Field label="Author (Art)">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "manga_author",
            })}
            value={cmgf.author_draw}
            onChange={(v) => umg("author_draw", v)}
            placeholder="Select art author..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReleaseDateInput
          label="Release Date"
          value={cmgf.release_date}
          onChange={(v) => umg("release_date", v)}
        />
        <ReleaseDateInput
          label="End Date"
          value={cmgf.end_date}
          onChange={(v) => umg("end_date", v)}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Anime Studio">
          <MultiSelect
            options={getSourceValues(sources, { kind: "studio" })}
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
            options={getSourceValues(sources, {
              kind: "option",
              category: "Publisher / Distributor TW",
              scope: "manga",
            })}
            value={cmgf.publisher_tw}
            onChange={(v) => umg("publisher_tw", v)}
            placeholder="Select publisher..."
          />
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
        <label className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">
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
            <span className="text-sm font-medium text-text-muted">
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
            <span className="text-sm font-medium text-text-muted">
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
      {/* `remark` is hidden here: the dedicated Remark field above edits the
          same singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <MangaNotes
        manga={{ system_id: editingItem?.system_id }}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
