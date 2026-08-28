// Frontend: add tab page file for CartoonAddTab.
import ComboBox from "../../components/forms/ComboBox";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import { getDisplayName, parseTypes } from "../../utils/media";
import {
  AIRING_STATUSES,
  CARTOON_AIRING_TYPES,
  IS_MAIN,
  MY_RATINGS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";

export { defaultCartoon } from "../../config/formFactories";

export default function CartoonAddTab({
  franchiseCollections,
  cf,
  uc,
  cartoonFillQuery,
  setCartoonFillQuery,
  cartoonFillOpen,
  setCartoonFillOpen,
  cartoonFillRef,
  cartoonFillResults,
  applyCartoonAutofill,
  allFranchises,
  seriesItemsForCartoon,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
      {/* Auto-fill search */}
      <div ref={cartoonFillRef} className="relative mb-4">
        <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
          <i className="fas fa-magic text-brand text-sm"></i>
          <input
            type="text"
            value={cartoonFillQuery}
            onChange={(e) => {
              setCartoonFillQuery(e.target.value);
              setCartoonFillOpen(true);
            }}
            onFocus={() => setCartoonFillOpen(true)}
            placeholder="Auto-fill from existing entry — type a name to search..."
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
            autoComplete="off"
          />
          {cartoonFillQuery && (
            <button
              type="button"
              onClick={() => {
                setCartoonFillQuery("");
                setCartoonFillOpen(false);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
        {cartoonFillOpen && cartoonFillResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {cartoonFillResults.map((c) => {
              const f = allFranchises.find(
                (x) => x.system_id === c.franchise_id,
              );
              return (
                <button
                  key={c.system_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyCartoonAutofill(c)}
                  className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {c.airing_type && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                        {c.airing_type}
                      </span>
                    )}
                    <span className="text-sm font-bold text-gray-800">
                      {c.cartoon_name_cn || c.cartoon_name_en}
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
          selectedId={cf.franchise_id}
          inputText={cf.franchise_text}
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
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={cf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForCartoon}
          selectedId={cf.series_id}
          inputText={cf.series_text}
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
          value={cf.cartoon_name_cn}
          onChange={(e) => uc("cartoon_name_cn", e.target.value)}
          placeholder="Chinese title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Cartoon Name EN">
          <input
            className={inputCls}
            value={cf.cartoon_name_en}
            onChange={(e) => uc("cartoon_name_en", e.target.value)}
            placeholder="English title"
          />
        </Field>
        <Field label="Cartoon Name Alt">
          <input
            className={inputCls}
            value={cf.cartoon_name_alt}
            onChange={(e) => uc("cartoon_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status & Classification" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Airing Type">
          <select
            className={selectCls}
            value={cf.airing_type}
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
            value={cf.airing_status}
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
        <Field label="Watching Status">
          <select
            className={selectCls}
            value={cf.watching_status}
            onChange={(e) => uc("watching_status", e.target.value)}
          >
            {WATCHING_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Is Main">
          <select
            className={selectCls}
            value={cf.is_main}
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
        <Field label="Total Episodes">
          <input
            className={inputCls}
            type="number"
            value={cf.ep_total}
            onChange={(e) => uc("ep_total", e.target.value)}
            placeholder="10"
          />
        </Field>
        <Field label="Episodes Finished">
          <input
            className={inputCls}
            type="number"
            value={cf.ep_fin}
            onChange={(e) => uc("ep_fin", e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={cf.my_rating}
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
        <Field label="IMDb Rating" hint="e.g. 9.2">
          <input
            className={inputCls}
            value={cf.imdb_rating}
            onChange={(e) => uc("imdb_rating", e.target.value)}
            placeholder="9.2"
          />
        </Field>
        <Field label="Ep Length (min)" hint="Minutes per episode">
          <input
            className={inputCls}
            type="number"
            value={cf.length_ep_min}
            onChange={(e) => uc("length_ep_min", e.target.value)}
            placeholder="22"
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Watch Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!cf.watch_next}
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
              checked={!!cf.to_rewatch}
              onChange={(e) => uc("to_rewatch", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
              Mark for rewatch
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-film" title="Classification & Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Source Official">
          <input
            className={inputCls}
            value={cf.source_official}
            onChange={(e) => uc("source_official", e.target.value)}
            placeholder="e.g. Disney+, Cartoon Network"
          />
        </Field>
        <Field label="Season Part">
          <input
            className={inputCls}
            value={cf.season_part}
            onChange={(e) => uc("season_part", e.target.value)}
            placeholder="e.g. Season 1"
          />
        </Field>
      </div>
      <ReleaseDateInput
        label="Release Date"
        value={cf.release_date}
        onChange={(v) => uc("release_date", v)}
      />

      <SectionHeader icon="fa-link" title="Source & Links" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="IMDb ID" hint="Full IMDb ID (e.g. tt1234567)">
          <input
            className={inputCls}
            type="text"
            value={cf.imdb_id}
            onChange={(e) => uc("imdb_id", e.target.value)}
            placeholder="tt1234567"
          />
        </Field>
        <Field label="IMDb Link">
          <input
            className={inputCls}
            type="url"
            value={cf.imdb_link}
            onChange={(e) => uc("imdb_link", e.target.value)}
            placeholder="https://www.imdb.com/title/tt..."
          />
        </Field>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
            Other Sources
          </label>
          <div className="space-y-2">
            {cf.source_other.map((entry, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className={inputCls}
                  placeholder="Source name (e.g. Disney+)"
                  value={entry.name}
                  onChange={(e) =>
                    uc(
                      "source_other",
                      cf.source_other.map((x, j) =>
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
                      cf.source_other.map((x, j) =>
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
                      cf.source_other.filter((_, j) => j !== i),
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
                uc("source_other", [...cf.source_other, { name: "", url: "" }])
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
          value={cf.cover_image_file}
          onChange={(e) => uc("cover_image_file", e.target.value)}
          placeholder="5114.jpg"
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={cf.remark}
          onChange={(e) => uc("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </div>
  );
}
