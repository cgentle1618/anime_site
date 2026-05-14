import ComboBox from "../../components/forms/ComboBox";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, parseTypes } from "../../utils/media";

export const defaultMovie = () => ({
  movie_name_en: "",
  movie_name_cn: "",
  movie_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  series_id: null,
  series_text: "",
  airing_status: "Not Yet Aired",
  watching_status: "Might Watch",
  my_rating: "",
  movie_type: "",
  is_main: "本傳",
  length_min: "",
  release_date_usa: "",
  release_date_tw: "",
  director: "",
  prequel_id: null,
  sequel_id: null,
  watch_order: "",
  derive_related: "",
  imdb_id: "",
  imdb_link: "",
  source_other: [],
  watch_next: false,
  to_rewatch: false,
  cover_image_file: "",
  remark: "",
});

export default function MovieAddTab({
  mf,
  umf,
  movieFillQuery,
  setMovieFillQuery,
  movieFillOpen,
  setMovieFillOpen,
  movieFillRef,
  movieFillResults,
  applyMovieAutofill,
  allFranchises,
  seriesItemsForMovie,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
      {/* Auto-fill search */}
      <div ref={movieFillRef} className="relative mb-4">
        <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
          <i className="fas fa-magic text-brand text-sm"></i>
          <input
            type="text"
            value={movieFillQuery}
            onChange={(e) => {
              setMovieFillQuery(e.target.value);
              setMovieFillOpen(true);
            }}
            onFocus={() => setMovieFillOpen(true)}
            placeholder="Auto-fill from existing entry — type a name to search..."
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
            autoComplete="off"
          />
          {movieFillQuery && (
            <button
              type="button"
              onClick={() => {
                setMovieFillQuery("");
                setMovieFillOpen(false);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
        {movieFillOpen && movieFillResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {movieFillResults.map((m) => {
              const f = allFranchises.find(
                (x) => x.system_id === m.franchise_id,
              );
              return (
                <button
                  key={m.system_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyMovieAutofill(m)}
                  className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {m.movie_type && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                        {m.movie_type}
                      </span>
                    )}
                    <span className="text-sm font-bold text-gray-800">
                      {m.movie_name_cn || m.movie_name_en}
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

      <SectionHeader icon="fa-ticket-alt" title="Titles & Naming" />
      <Field label="Franchise">
        <ComboBox
          items={allFranchises
            .filter(
              (f) =>
                parseTypes(f.franchise_type).includes("Movie") ||
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
          selectedId={mf.franchise_id}
          inputText={mf.franchise_text}
          onSelect={(id, label) => {
            umf("franchise_id", id);
            umf("franchise_text", label);
            umf("series_id", null);
            umf("series_text", "");
          }}
          onType={(text) => {
            umf("franchise_text", text);
            umf("franchise_id", null);
            umf("series_id", null);
            umf("series_text", "");
          }}
          onClear={() => {
            umf("franchise_id", null);
            umf("franchise_text", "");
            umf("series_id", null);
            umf("series_text", "");
          }}
          placeholder="Search or type new franchise..."
          allowNew
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForMovie}
          selectedId={mf.series_id}
          inputText={mf.series_text}
          onSelect={(id, label) => {
            umf("series_id", id);
            umf("series_text", label);
          }}
          onType={(text) => {
            umf("series_text", text);
            umf("series_id", null);
          }}
          onClear={() => {
            umf("series_id", null);
            umf("series_text", "");
          }}
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
      <Field label="Movie Name EN">
        <input
          className={inputCls}
          value={mf.movie_name_en}
          onChange={(e) => umf("movie_name_en", e.target.value)}
          placeholder="English title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Movie Name CN">
          <input
            className={inputCls}
            value={mf.movie_name_cn}
            onChange={(e) => umf("movie_name_cn", e.target.value)}
            placeholder="Chinese title"
          />
        </Field>
        <Field label="Movie Name Alt">
          <input
            className={inputCls}
            value={mf.movie_name_alt}
            onChange={(e) => umf("movie_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status & Classification" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Airing Status">
          <select
            className={selectCls}
            value={mf.airing_status}
            onChange={(e) => umf("airing_status", e.target.value)}
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
            value={mf.watching_status}
            onChange={(e) => umf("watching_status", e.target.value)}
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
        <Field label="Movie Type">
          <select
            className={selectCls}
            value={mf.movie_type}
            onChange={(e) => umf("movie_type", e.target.value)}
          >
            <option value="">—</option>
            <option value="Reality">Reality</option>
            <option value="Animation">Animation</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Main / Spinoff">
          <select
            className={selectCls}
            value={mf.is_main}
            onChange={(e) => umf("is_main", e.target.value)}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={mf.my_rating}
            onChange={(e) => umf("my_rating", e.target.value)}
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
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Watch Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!mf.watch_next}
              onChange={(e) => umf("watch_next", e.target.checked)}
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
              checked={!!mf.to_rewatch}
              onChange={(e) => umf("to_rewatch", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
              Mark for rewatch
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-info-circle" title="Release & Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Release Date USA">
          <input
            className={inputCls}
            value={mf.release_date_usa}
            onChange={(e) => umf("release_date_usa", e.target.value)}
            placeholder="e.g. JUL 2024"
          />
        </Field>
        <Field label="Release Date TW">
          <input
            className={inputCls}
            value={mf.release_date_tw}
            onChange={(e) => umf("release_date_tw", e.target.value)}
            placeholder="e.g. AUG 2024"
          />
        </Field>
        <Field label="Length (min)">
          <input
            className={inputCls}
            type="number"
            value={mf.length_min}
            onChange={(e) => umf("length_min", e.target.value)}
            placeholder="120"
          />
        </Field>
        <Field label="Director">
          <input
            className={inputCls}
            value={mf.director}
            onChange={(e) => umf("director", e.target.value)}
            placeholder="Director name"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Prequel ID" hint="UUID of prequel entry">
          <input
            className={inputCls + " font-mono text-xs"}
            value={mf.prequel_id || ""}
            onChange={(e) => umf("prequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Sequel ID" hint="UUID of sequel entry">
          <input
            className={inputCls + " font-mono text-xs"}
            value={mf.sequel_id || ""}
            onChange={(e) => umf("sequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Watch Order" hint="e.g. 1, 1.5, 2">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={mf.watch_order}
            onChange={(e) => umf("watch_order", e.target.value)}
            placeholder="e.g. 1, 1.5, 2"
          />
        </Field>
        <Field
          label="Derive Related"
          hint="Set to No to skip prequel/sequel derivation"
        >
          <select
            className={selectCls}
            value={mf.derive_related}
            onChange={(e) => umf("derive_related", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="IMDb & Sources" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="IMDb ID" hint="Full IMDb ID (e.g. tt1234567)">
          <input
            className={inputCls}
            type="text"
            value={mf.imdb_id}
            onChange={(e) => umf("imdb_id", e.target.value)}
            placeholder="tt1234567"
          />
        </Field>
        <Field label="IMDb Link">
          <input
            className={inputCls}
            type="url"
            value={mf.imdb_link}
            onChange={(e) => umf("imdb_link", e.target.value)}
            placeholder="https://www.imdb.com/title/tt..."
          />
        </Field>
      </div>
      <Field label="Other Sources">
        <div className="space-y-2">
          {mf.source_other.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Platform name"
                value={entry.name}
                onChange={(e) =>
                  umf(
                    "source_other",
                    mf.source_other.map((x, j) =>
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
                  umf(
                    "source_other",
                    mf.source_other.map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="text-red-400 hover:text-red-600 px-1 shrink-0"
                onClick={() =>
                  umf(
                    "source_other",
                    mf.source_other.filter((_, j) => j !== i),
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
              umf("source_other", [...mf.source_other, { name: "", url: "" }])
            }
          >
            + Add Source
          </button>
        </div>
      </Field>

      <SectionHeader icon="fa-image" title="Cover & Notes" />
      <Field label="Cover Image File" hint="e.g. 5114.jpg">
        <input
          className={inputCls}
          value={mf.cover_image_file}
          onChange={(e) => umf("cover_image_file", e.target.value)}
          placeholder="5114.jpg"
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={mf.remark}
          onChange={(e) => umf("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </div>
  );
}
