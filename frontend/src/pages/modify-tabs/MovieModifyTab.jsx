// Frontend: modify tab page file for MovieModifyTab.
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, getSourceValues, parseTypes } from "../../utils/media";
import MovieNotes from "../detail/MovieNotes";
import {
  AIRING_STATUSES,
  WATCHING_STATUSES,
  MOVIE_TYPES,
  IS_MAIN,
  MY_RATINGS,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";

export default function MovieModifyTab({
  franchiseCollections,
  mmf,
  umm,
  allFranchises,
  seriesItemsForMovie,
  editingItem,
  sources,
}) {
  return (
    <>
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
          selectedId={mmf.franchise_id}
          inputText={mmf.franchise_text}
          onSelect={(id, label) => {
            umm("franchise_id", id);
            umm("franchise_text", label);
            umm("series_id", null);
            umm("series_text", "");
          }}
          onType={(text) => {
            umm("franchise_text", text);
            umm("franchise_id", null);
            umm("series_id", null);
            umm("series_text", "");
          }}
          onClear={() => {
            umm("franchise_id", null);
            umm("franchise_text", "");
            umm("series_id", null);
            umm("series_text", "");
          }}
          placeholder="Search franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={mmf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForMovie}
          selectedId={mmf.series_id}
          inputText={mmf.series_text || ""}
          onSelect={(id, label) => {
            umm("series_id", id);
            umm("series_text", label);
          }}
          onType={(text) => {
            umm("series_text", text);
            umm("series_id", null);
          }}
          onClear={() => {
            umm("series_id", null);
            umm("series_text", "");
          }}
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
      <Field label="Movie Name EN">
        <input
          className={inputCls}
          value={mmf.movie_name_en || ""}
          onChange={(e) => umm("movie_name_en", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Movie Name CN">
          <input
            className={inputCls}
            value={mmf.movie_name_cn || ""}
            onChange={(e) => umm("movie_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Movie Name Alt">
          <input
            className={inputCls}
            value={mmf.movie_name_alt || ""}
            onChange={(e) => umm("movie_name_alt", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status & Classification" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Airing Status">
          <select
            className={selectCls}
            value={mmf.airing_status || ""}
            onChange={(e) => umm("airing_status", e.target.value)}
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
            value={mmf.watching_status}
            onChange={(e) => umm("watching_status", e.target.value)}
          >
            <StatusOptions statuses={WATCHING_STATUSES} />
          </select>
        </Field>
        <Field label="Movie Type">
          <select
            className={selectCls}
            value={mmf.movie_type || ""}
            onChange={(e) => umm("movie_type", e.target.value)}
          >
            <option value="">—</option>
            {MOVIE_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Main / Spinoff">
          <select
            className={selectCls}
            value={mmf.is_main || ""}
            onChange={(e) => umm("is_main", e.target.value)}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={mmf.my_rating || ""}
            onChange={(e) => umm("my_rating", e.target.value)}
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
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Watch Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!mmf.watch_next}
              onChange={(e) => umm("watch_next", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
              Add to Watch Next list
            </span>
          </label>
        </Field>
        <Field label="To Rewatch">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!mmf.to_rewatch}
              onChange={(e) => umm("to_rewatch", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
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
            value={mmf.release_date_usa || ""}
            onChange={(e) => umm("release_date_usa", e.target.value)}
            placeholder="e.g. JUL 2024"
          />
        </Field>
        <Field label="Release Date TW">
          <input
            className={inputCls}
            value={mmf.release_date_tw || ""}
            onChange={(e) => umm("release_date_tw", e.target.value)}
            placeholder="e.g. AUG 2024"
          />
        </Field>
        <Field label="Length (min)">
          <input
            className={inputCls}
            type="number"
            value={mmf.length_min ?? ""}
            onChange={(e) => umm("length_min", e.target.value)}
          />
        </Field>
        <Field label="Director">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "director",
              scope: "non_anime",
            })}
            value={mmf.director || ""}
            onChange={(v) => umm("director", v)}
            placeholder="Select or type director..."
          />
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="IMDb & Sources" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="IMDb ID">
          <input
            className={inputCls}
            type="text"
            value={mmf.imdb_id ?? ""}
            onChange={(e) => umm("imdb_id", e.target.value)}
            placeholder="tt1234567"
          />
        </Field>
        <Field label="IMDb Link">
          <input
            className={inputCls}
            type="url"
            value={mmf.imdb_link || ""}
            onChange={(e) => umm("imdb_link", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Other Sources">
        <div className="space-y-2">
          {(mmf.source_other || []).map((entry, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Platform name"
                value={entry.name}
                onChange={(e) =>
                  umm(
                    "source_other",
                    mmf.source_other.map((x, j) =>
                      j === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                className={inputCls}
                type="url"
                placeholder="https://..."
                value={entry.url}
                onChange={(e) =>
                  umm(
                    "source_other",
                    mmf.source_other.map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="text-danger/70 hover:text-danger px-1 shrink-0"
                onClick={() =>
                  umm(
                    "source_other",
                    mmf.source_other.filter((_, j) => j !== i),
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
              umm("source_other", [
                ...(mmf.source_other || []),
                { name: "", url: "" },
              ])
            }
          >
            + Add Source
          </button>
        </div>
      </Field>

      <SectionHeader icon="fa-image" title="Cover & Notes" />
      <Field label="Cover Image File">
        <input
          className={inputCls}
          value={mmf.cover_image_file || ""}
          onChange={(e) => umm("cover_image_file", e.target.value)}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={mmf.remark || ""}
          onChange={(e) => umm("remark", e.target.value)}
        />
      </Field>

      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the dedicated Remark field above edits the
          same singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <MovieNotes
        key={editingItem.system_id}
        movie={{ system_id: editingItem.system_id }}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
