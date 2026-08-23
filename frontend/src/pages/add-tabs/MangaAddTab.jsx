// Frontend: add tab page file for MangaAddTab.
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, parseTypes, getOptions } from "../../utils/media";
import {
  IS_MAIN,
  MANGA_REGIONS,
  MANGA_SERIALIZATION_STATUSES,
  MY_RATINGS,
  READING_STATUSES,
} from "../../config/fieldOptions";

export { defaultManga } from "../../config/formFactories";

export default function MangaAddTab({
  franchiseCollections,
  mgf,
  umg,
  mangaFillQuery,
  setMangaFillQuery,
  mangaFillOpen,
  setMangaFillOpen,
  mangaFillRef,
  mangaFillResults,
  applyMangaAutofill,
  allFranchises,
  seriesItemsForManga,
  allOptions,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
      {/* Auto-fill search */}
      <div ref={mangaFillRef} className="relative mb-4">
        <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
          <i className="fas fa-magic text-brand text-sm"></i>
          <input
            type="text"
            value={mangaFillQuery}
            onChange={(e) => {
              setMangaFillQuery(e.target.value);
              setMangaFillOpen(true);
            }}
            onFocus={() => setMangaFillOpen(true)}
            placeholder="Auto-fill from existing entry — type a name to search..."
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
            autoComplete="off"
          />
          {mangaFillQuery && (
            <button
              type="button"
              onClick={() => {
                setMangaFillQuery("");
                setMangaFillOpen(false);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
        {mangaFillOpen && mangaFillResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {mangaFillResults.map((m) => {
              const f = allFranchises.find(
                (x) => x.system_id === m.franchise_id,
              );
              return (
                <button
                  key={m.system_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyMangaAutofill(m)}
                  className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {m.region && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                        {m.region}
                      </span>
                    )}
                    <span className="text-sm font-bold text-gray-800">
                      {m.manga_name_cn || m.manga_name_en}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {f ? getDisplayName(f, "franchise") : "Standalone"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

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
          selectedId={mgf.franchise_id}
          inputText={mgf.franchise_text}
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
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={mgf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForManga}
          selectedId={mgf.series_id}
          inputText={mgf.series_text}
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
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
      <Field label="Manga Name CN">
        <input
          className={inputCls}
          value={mgf.manga_name_cn}
          onChange={(e) => umg("manga_name_cn", e.target.value)}
          placeholder="Chinese title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Manga Name EN">
          <input
            className={inputCls}
            value={mgf.manga_name_en}
            onChange={(e) => umg("manga_name_en", e.target.value)}
            placeholder="English title"
          />
        </Field>
        <Field label="Manga Name Alt">
          <input
            className={inputCls}
            value={mgf.manga_name_alt}
            onChange={(e) => umg("manga_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Manga Name Roman">
          <input
            className={inputCls}
            value={mgf.manga_name_roman}
            onChange={(e) => umg("manga_name_roman", e.target.value)}
            placeholder="Romanized title"
          />
        </Field>
        <Field label="Manga Name JP">
          <input
            className={inputCls}
            value={mgf.manga_name_jp}
            onChange={(e) => umg("manga_name_jp", e.target.value)}
            placeholder="Japanese title"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Region">
          <select
            className={selectCls}
            value={mgf.region}
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
            value={mgf.is_main}
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
            value={mgf.serialization_status}
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
            value={mgf.reading_status}
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
            value={mgf.my_rating}
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
            value={mgf.ch_total}
            onChange={(e) => umg("ch_total", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Ch Finished">
          <input
            className={inputCls}
            type="number"
            value={mgf.ch_fin}
            onChange={(e) => umg("ch_fin", e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Vol Total">
          <input
            className={inputCls}
            type="number"
            value={mgf.vol_total}
            onChange={(e) => umg("vol_total", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Vol Finished">
          <input
            className={inputCls}
            type="number"
            value={mgf.vol_fin}
            onChange={(e) => umg("vol_fin", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Vol Fin Page">
          <input
            className={inputCls}
            type="number"
            value={mgf.vol_fin_page}
            onChange={(e) => umg("vol_fin_page", e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-star" title="Scores" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="MAL Rating" hint="e.g. 8.5">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={mgf.mal_rating}
            onChange={(e) => umg("mal_rating", e.target.value)}
            placeholder="8.5"
          />
        </Field>
        <Field label="MAL Rank">
          <input
            className={inputCls}
            type="number"
            value={mgf.mal_rank}
            onChange={(e) => umg("mal_rank", e.target.value)}
            placeholder="100"
          />
        </Field>
        <Field label="AniList Rating" hint="e.g. 85">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={mgf.anilist_rating}
            onChange={(e) => umg("anilist_rating", e.target.value)}
            placeholder="85"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-pen-nib" title="Authors & Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Author (Plot)">
          <MultiSelect
            options={getOptions(allOptions, "Manga Author")}
            value={mgf.author_plot}
            onChange={(v) => umg("author_plot", v)}
            placeholder="Select plot author..."
          />
        </Field>
        <Field label="Author (Art)">
          <MultiSelect
            options={getOptions(allOptions, "Manga Author")}
            value={mgf.author_draw}
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
            value={mgf.release_year}
            onChange={(e) => umg("release_year", e.target.value)}
            placeholder="2020"
          />
        </Field>
        <Field label="End Year">
          <input
            className={inputCls}
            type="number"
            value={mgf.end_year}
            onChange={(e) => umg("end_year", e.target.value)}
            placeholder="2024"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Anime Studio">
          <MultiSelect
            options={getOptions(allOptions, "Studio")}
            value={mgf.anime_studio}
            onChange={(v) => umg("anime_studio", v)}
            placeholder="Select studio..."
          />
        </Field>
        <Field label="Serialization Platform">
          <input
            className={inputCls}
            value={mgf.serialization_platform}
            onChange={(e) => umg("serialization_platform", e.target.value)}
            placeholder="e.g. 週刊少年ジャンプ"
          />
        </Field>
        <Field label="Publisher TW">
          <MultiSelect
            options={getOptions(allOptions, "Manga Publisher TW")}
            value={mgf.publisher_tw}
            onChange={(v) => umg("publisher_tw", v)}
            placeholder="Select publisher..."
          />
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Watch Order" hint="e.g. 1, 1.5, 2">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={mgf.watch_order}
            onChange={(e) => umg("watch_order", e.target.value)}
            placeholder="e.g. 1, 1.5, 2"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="MAL ID">
          <input
            className={inputCls}
            type="number"
            value={mgf.mal_id}
            onChange={(e) => umg("mal_id", e.target.value)}
            placeholder="12345"
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            type="url"
            value={mgf.mal_link}
            onChange={(e) => umg("mal_link", e.target.value)}
            placeholder="https://myanimelist.net/manga/..."
          />
        </Field>
        <Field label="AniList Link">
          <input
            className={inputCls}
            type="url"
            value={mgf.anilist_link}
            onChange={(e) => umg("anilist_link", e.target.value)}
            placeholder="https://anilist.co/manga/..."
          />
        </Field>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          Other Sources
        </label>
        <div className="space-y-2">
          {mgf.source_other.map((entry, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls}
                placeholder="Source name"
                value={entry.name}
                onChange={(e) =>
                  umg(
                    "source_other",
                    mgf.source_other.map((x, j) =>
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
                    mgf.source_other.map((x, j) =>
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
                    mgf.source_other.filter((_, j) => j !== i),
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
              umg("source_other", [...mgf.source_other, { name: "", url: "" }])
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
              checked={!!mgf.read_next}
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
              checked={!!mgf.to_reread}
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
      <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
        <input
          className={inputCls}
          value={mgf.cover_image_file}
          onChange={(e) => umg("cover_image_file", e.target.value)}
          placeholder="5114.jpg"
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={mgf.remark}
          onChange={(e) => umg("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </div>
  );
}
