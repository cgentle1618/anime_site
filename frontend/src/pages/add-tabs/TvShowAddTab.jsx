// Frontend: add tab page file for TvShowAddTab.
import ComboBox from "../../components/forms/ComboBox";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, parseTypes } from "../../utils/media";
import {
  AIRING_STATUSES,
  IS_MAIN,
  MY_RATINGS,
  TV_REGIONS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";

export { defaultTvShow } from "../../config/formFactories";

export default function TvShowAddTab({
  franchiseCollections,
  tvf,
  utf,
  tvFillQuery,
  setTvFillQuery,
  tvFillOpen,
  setTvFillOpen,
  tvFillRef,
  tvFillResults,
  applyTvShowAutofill,
  allFranchises,
  seriesItemsForTvShow,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
      {/* Auto-fill search */}
      <div ref={tvFillRef} className="relative mb-4">
        <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
          <i className="fas fa-magic text-brand text-sm"></i>
          <input
            type="text"
            value={tvFillQuery}
            onChange={(e) => {
              setTvFillQuery(e.target.value);
              setTvFillOpen(true);
            }}
            onFocus={() => setTvFillOpen(true)}
            placeholder="Auto-fill from existing entry — type a name to search..."
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
            autoComplete="off"
          />
          {tvFillQuery && (
            <button
              type="button"
              onClick={() => {
                setTvFillQuery("");
                setTvFillOpen(false);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
        {tvFillOpen && tvFillResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {tvFillResults.map((t) => {
              const f = allFranchises.find(
                (x) => x.system_id === t.franchise_id,
              );
              return (
                <button
                  key={t.system_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyTvShowAutofill(t)}
                  className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {t.region && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                        {t.region}
                      </span>
                    )}
                    <span className="text-sm font-bold text-gray-800">
                      {t.tv_name_cn || t.tv_name_en}
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
          selectedId={tvf.franchise_id}
          inputText={tvf.franchise_text}
          onSelect={(id, label) => {
            utf("franchise_id", id);
            utf("franchise_text", label);
            utf("series_id", null);
            utf("series_text", "");
          }}
          onType={(text) => {
            utf("franchise_text", text);
            utf("franchise_id", null);
            utf("series_id", null);
            utf("series_text", "");
          }}
          onClear={() => {
            utf("franchise_id", null);
            utf("franchise_text", "");
            utf("series_id", null);
            utf("series_text", "");
          }}
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={tvf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForTvShow}
          selectedId={tvf.series_id}
          inputText={tvf.series_text}
          onSelect={(id, label) => {
            utf("series_id", id);
            utf("series_text", label);
          }}
          onType={(text) => {
            utf("series_text", text);
            utf("series_id", null);
          }}
          onClear={() => {
            utf("series_id", null);
            utf("series_text", "");
          }}
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
      <Field label="TV Name CN">
        <input
          className={inputCls}
          value={tvf.tv_name_cn}
          onChange={(e) => utf("tv_name_cn", e.target.value)}
          placeholder="Chinese title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="TV Name EN">
          <input
            className={inputCls}
            value={tvf.tv_name_en}
            onChange={(e) => utf("tv_name_en", e.target.value)}
            placeholder="English title"
          />
        </Field>
        <Field label="TV Name Alt">
          <input
            className={inputCls}
            value={tvf.tv_name_alt}
            onChange={(e) => utf("tv_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status & Classification" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Airing Status">
          <select
            className={selectCls}
            value={tvf.airing_status}
            onChange={(e) => utf("airing_status", e.target.value)}
          >
            <option value="">—</option>
            {AIRING_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Watching Status">
          <select
            className={selectCls}
            value={tvf.watching_status}
            onChange={(e) => utf("watching_status", e.target.value)}
          >
            {WATCHING_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Is Main">
          <select
            className={selectCls}
            value={tvf.is_main}
            onChange={(e) => utf("is_main", e.target.value)}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Total Episodes">
          <input
            className={inputCls}
            type="number"
            value={tvf.ep_total}
            onChange={(e) => utf("ep_total", e.target.value)}
            placeholder="10"
          />
        </Field>
        <Field label="Episodes Finished">
          <input
            className={inputCls}
            type="number"
            value={tvf.ep_fin}
            onChange={(e) => utf("ep_fin", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={tvf.my_rating}
            onChange={(e) => utf("my_rating", e.target.value)}
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
      <Field label="IMDB Rating" hint="e.g. 9.2">
        <input
          className={inputCls}
          value={tvf.imdb_rating}
          onChange={(e) => utf("imdb_rating", e.target.value)}
          placeholder="9.2"
        />
      </Field>
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Watch Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!tvf.watch_next}
              onChange={(e) => utf("watch_next", e.target.checked)}
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
              checked={!!tvf.to_rewatch}
              onChange={(e) => utf("to_rewatch", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
              Mark for rewatch
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-film" title="Classification & Production" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Region">
          <select
            className={selectCls}
            value={tvf.region || ""}
            onChange={(e) => utf("region", e.target.value)}
          >
            <option value="">—</option>
            {TV_REGIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source Official">
          <input
            className={inputCls}
            value={tvf.source_official}
            onChange={(e) => utf("source_official", e.target.value)}
            placeholder="e.g. Netflix, HBO"
          />
        </Field>
        <Field label="Season Part">
          <input
            className={inputCls}
            value={tvf.season_part}
            onChange={(e) => utf("season_part", e.target.value)}
            placeholder="e.g. Season 1"
          />
        </Field>
      </div>
      <Field label="Release Date" hint="e.g. FEB 2026">
        <input
          className={inputCls}
          value={tvf.release_date}
          onChange={(e) => utf("release_date", e.target.value)}
          placeholder="FEB 2026"
        />
      </Field>

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Watch Order" hint="e.g. 1, 1.5, 2">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={tvf.watch_order}
            onChange={(e) => utf("watch_order", e.target.value)}
            placeholder="e.g. 1, 1.5, 2"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Source & Links" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="IMDb ID" hint="Full IMDb ID (e.g. tt1234567)">
          <input
            className={inputCls}
            type="text"
            value={tvf.imdb_id}
            onChange={(e) => utf("imdb_id", e.target.value)}
            placeholder="tt1234567"
          />
        </Field>
        <Field label="IMDb Link">
          <input
            className={inputCls}
            type="url"
            value={tvf.imdb_link}
            onChange={(e) => utf("imdb_link", e.target.value)}
            placeholder="https://www.imdb.com/title/tt..."
          />
        </Field>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
            Other Sources
          </label>
          <div className="space-y-2">
            {tvf.source_other.map((entry, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className={inputCls}
                  placeholder="Source name (e.g. Disney+)"
                  value={entry.name}
                  onChange={(e) =>
                    utf(
                      "source_other",
                      tvf.source_other.map((x, j) =>
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
                    utf(
                      "source_other",
                      tvf.source_other.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="text-red-400 hover:text-red-600 px-1 shrink-0"
                  onClick={() =>
                    utf(
                      "source_other",
                      tvf.source_other.filter((_, j) => j !== i),
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
                utf("source_other", [
                  ...tvf.source_other,
                  { name: "", url: "" },
                ])
              }
            >
              + Add Source
            </button>
          </div>
        </div>
      </div>

      <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
      <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
        <input
          className={inputCls}
          value={tvf.cover_image_file}
          onChange={(e) => utf("cover_image_file", e.target.value)}
          placeholder="5114.jpg"
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={tvf.remark}
          onChange={(e) => utf("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </div>
  );
}
