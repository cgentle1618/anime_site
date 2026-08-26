// Frontend: modify tab page file for SeriesModifyTab.
import { getDisplayName } from "../../utils/media";
import ComboBox from "../../components/forms/ComboBox";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";

function getEntryYear(e) {
  if (e.release_year != null) return parseInt(e.release_year, 10) || 0;
  const d =
    e.release_date_jp ||
    e.release_date_tw ||
    e.release_date_usa ||
    e.release_date;
  if (d) return parseInt(String(d).slice(0, 4), 10) || 0;
  return 0;
}

export default function SeriesModifyTab({
  sf,
  us,
  franchiseItems,
  franchiseCollections,
  allAnime,
  allMovies,
  allTvShows,
  allCartoons,
  allMangas,
  allNovels,
  allComics,
  editingItem,
}) {
  const seriesId = editingItem?.system_id;

  // anime_movies is absent on purpose: that table has no series_id column, so
  // no anime movie can ever belong to a series.
  const seriesEntries = [
    ...(allAnime || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "anime" })),
    ...(allMovies || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "movie" })),
    ...(allTvShows || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "tv-show" })),
    ...(allCartoons || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "cartoon" })),
    ...(allMangas || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "manga" })),
    ...(allNovels || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "novel" })),
    ...(allComics || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "comic" })),
  ].sort((a, b) => getEntryYear(b) - getEntryYear(a));

  function entryOptionLabel(e) {
    const name = getDisplayName(e, e._type);
    const yr =
      e.release_year ||
      (e.release_date_jp || e.release_date_usa || e.release_date || "")
        .toString()
        .slice(0, 4);
    return `${name}${yr ? ` (${yr})` : ""} [${e._type}]`;
  }

  return (
    <>
      <SectionHeader icon="fa-layer-group" title="Titles & Naming" />
      <Field label="Parent Franchise" required>
        <ComboBox
          items={franchiseItems}
          selectedId={sf.franchise_id}
          inputText={sf.franchise_text}
          onSelect={(id, label) => {
            us("franchise_id", id);
            us("franchise_text", label);
          }}
          onType={(text) => {
            us("franchise_text", text);
            us("franchise_id", null);
          }}
          onClear={() => {
            us("franchise_id", null);
            us("franchise_text", "");
          }}
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={sf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series Name EN">
        <input
          className={inputCls}
          value={sf.series_name_en}
          onChange={(e) => us("series_name_en", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Series Name CN">
          <input
            className={inputCls}
            value={sf.series_name_cn}
            onChange={(e) => us("series_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Series Name roman">
          <input
            className={inputCls}
            value={sf.series_name_roman}
            onChange={(e) => us("series_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Series Name JP">
          <input
            className={inputCls}
            value={sf.series_name_jp}
            onChange={(e) => us("series_name_jp", e.target.value)}
          />
        </Field>
        <Field label="Series Name Alt">
          <input
            className={inputCls}
            value={sf.series_name_alt}
            onChange={(e) => us("series_name_alt", e.target.value)}
          />
        </Field>
      </div>
      <SectionHeader icon="fa-info-circle" title="Other Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={sf.my_rating}
            onChange={(e) => us("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {["S", "A+", "A", "B", "C", "D", "E", "F"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expectation">
          <select
            className={selectCls}
            value={sf.series_expectation}
            onChange={(e) => us("series_expectation", e.target.value)}
          >
            <option value="">—</option>
            {["Highest", "High", "Medium", "Low"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <SectionHeader icon="fa-image" title="Cover Images" />
      <Field
        label="Main Cover"
        hint="Series hub cover — leave blank to auto-pick latest entry with cover"
      >
        <select
          className={selectCls}
          value={sf.cover_entry_id || ""}
          onChange={(e) => us("cover_entry_id", e.target.value || null)}
        >
          <option value="">— Auto (latest with cover) —</option>
          {seriesEntries.map((e) => (
            <option key={e.system_id} value={e.system_id}>
              {entryOptionLabel(e)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="To Rewatch">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!sf.to_rewatch}
            onChange={(e) => us("to_rewatch", e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-sm font-medium text-gray-700">
            Mark this series for rewatch
          </span>
        </label>
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={sf.remark}
          onChange={(e) => us("remark", e.target.value)}
        />
      </Field>
    </>
  );
}
