// Frontend: modify tab page file for ComicModifyTab.
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, getOptions, parseTypes } from "../../utils/media";
import {
  COMIC_TYPES,
  MANGA_SERIALIZATION_STATUSES as SERIALIZATION_STATUSES,
  MY_RATINGS,
  READING_STATUSES,
} from "../../config/fieldOptions";

// `events` is an array in the form but MultiSelect speaks comma-separated
// strings, so it is converted at this boundary in both directions.
const eventsToString = (v) => (Array.isArray(v) ? v.join(", ") : v || "");
const eventsToArray = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export default function ComicModifyTab({
  franchiseCollections,
  ccmf,
  ucm,
  allFranchises,
  seriesItemsForComic,
  editingItem,
  ribbonSection,
  allOptions,
}) {
  // Free-text ComboBoxes over a system-option category: the typed value is the
  // value, so `selectedId` is only set when it matches a known option.
  const optionCombo = (category, key, placeholder) => {
    const options = getOptions(allOptions, category);
    return (
      <ComboBox
        items={options.map((v) => ({ id: v, label: v }))}
        selectedId={options.includes(ccmf[key]) ? ccmf[key] : null}
        inputText={ccmf[key] || ""}
        onSelect={(id) => ucm(key, id)}
        onType={(text) => ucm(key, text)}
        onClear={() => ucm(key, "")}
        placeholder={placeholder}
        allowNew
      />
    );
  };

  return (
    <>
      {ribbonSection}

      <SectionHeader icon="fa-book" title="Titles & Naming" />
      <Field label="Franchise">
        <ComboBox
          items={allFranchises
            .filter(
              (f) =>
                parseTypes(f.franchise_type).includes("Comic") ||
                !f.franchise_type,
            )
            .map((f) => ({
              id: f.system_id,
              label: getDisplayName(f, "franchise"),
              searchText: [
                f.franchise_name_en,
                f.franchise_name_cn,
                f.franchise_name_roman,
                f.franchise_name_jp,
                f.franchise_name_alt,
              ]
                .filter(Boolean)
                .join(" "),
            }))}
          selectedId={ccmf.franchise_id}
          inputText={ccmf.franchise_text || ""}
          onSelect={(id, label) => {
            ucm("franchise_id", id);
            ucm("franchise_text", label);
            ucm("series_id", null);
            ucm("series_text", "");
          }}
          onType={(text) => {
            ucm("franchise_text", text);
            ucm("franchise_id", null);
            ucm("series_id", null);
            ucm("series_text", "");
          }}
          onClear={() => {
            ucm("franchise_id", null);
            ucm("franchise_text", "");
            ucm("series_id", null);
            ucm("series_text", "");
          }}
          placeholder="Search franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={ccmf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForComic}
          selectedId={ccmf.series_id}
          inputText={ccmf.series_text || ""}
          onSelect={(id, label) => {
            ucm("series_id", id);
            ucm("series_text", label);
          }}
          onType={(text) => {
            ucm("series_text", text);
            ucm("series_id", null);
          }}
          onClear={() => {
            ucm("series_id", null);
            ucm("series_text", "");
          }}
          placeholder="Search series..."
          allowNew
        />
      </Field>
      <Field label="Comic Name EN">
        <input
          className={inputCls}
          value={ccmf.comic_name_en || ""}
          onChange={(e) => ucm("comic_name_en", e.target.value)}
          placeholder="English title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Comic Name CN">
          <input
            className={inputCls}
            value={ccmf.comic_name_cn || ""}
            onChange={(e) => ucm("comic_name_cn", e.target.value)}
            placeholder="Chinese title"
          />
        </Field>
        <Field label="Comic Name Alt">
          <input
            className={inputCls}
            value={ccmf.comic_name_alt || ""}
            onChange={(e) => ucm("comic_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Volume Label" hint="e.g. Vol. 5 (2018)">
          <input
            className={inputCls}
            value={ccmf.volume_label || ""}
            onChange={(e) => ucm("volume_label", e.target.value)}
            placeholder="Vol. 5 (2018)"
          />
        </Field>
        <Field label="Comic Type">
          <select
            className={selectCls}
            value={ccmf.comic_type || ""}
            onChange={(e) => ucm("comic_type", e.target.value)}
          >
            <option value="">—</option>
            {COMIC_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <SectionHeader icon="fa-sitemap" title="Classification" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Continuity">
          {optionCombo("Comic Continuity", "continuity", "e.g. Earth-616")}
        </Field>
        <Field label="Era">
          {optionCombo("Comic Era", "era", "e.g. Modern")}
        </Field>
      </div>
      <Field label="Events" hint="Marvel events this run is part of">
        <MultiSelect
          options={getOptions(allOptions, "Comic Event")}
          value={eventsToString(ccmf.events)}
          onChange={(v) => ucm("events", eventsToArray(v))}
          placeholder="Select or type event..."
        />
      </Field>

      <SectionHeader icon="fa-chart-bar" title="Status" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Serialization Status">
          <select
            className={selectCls}
            value={ccmf.serialization_status || ""}
            onChange={(e) => ucm("serialization_status", e.target.value)}
          >
            <option value="">—</option>
            {SERIALIZATION_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reading Status">
          <select
            className={selectCls}
            value={ccmf.reading_status}
            onChange={(e) => ucm("reading_status", e.target.value)}
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
            value={ccmf.my_rating || ""}
            onChange={(e) => ucm("my_rating", e.target.value)}
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
        <Field label="Issues Finished">
          <input
            className={inputCls}
            type="number"
            value={ccmf.issue_fin ?? ""}
            onChange={(e) => ucm("issue_fin", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Total Issues" hint="Leave blank if unknown or ongoing">
          <input
            className={inputCls}
            type="number"
            value={ccmf.issue_total ?? ""}
            onChange={(e) => ucm("issue_total", e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-pen-nib" title="Credits" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Writer">
          <MultiSelect
            options={getOptions(allOptions, "Comic Writer")}
            value={ccmf.writer || ""}
            onChange={(v) => ucm("writer", v)}
            placeholder="Select or type writer..."
          />
        </Field>
        <Field label="Artist">
          <MultiSelect
            options={getOptions(allOptions, "Comic Artist")}
            value={ccmf.artist || ""}
            onChange={(v) => ucm("artist", v)}
            placeholder="Select or type artist..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Publisher">
          {optionCombo("Comic Publisher", "publisher", "e.g. Marvel")}
        </Field>
        <Field label="Imprint">
          {optionCombo("Comic Imprint", "imprint", "e.g. Ultimate")}
        </Field>
        <Field label="Publisher TW">
          {optionCombo("Distributor TW", "publisher_tw", "e.g. 東立")}
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Release Year">
          <input
            className={inputCls}
            type="number"
            value={ccmf.release_year ?? ""}
            onChange={(e) => ucm("release_year", e.target.value)}
            placeholder="2020"
          />
        </Field>
        <Field label="End Year">
          <input
            className={inputCls}
            type="number"
            value={ccmf.end_year ?? ""}
            onChange={(e) => ucm("end_year", e.target.value)}
            placeholder="2024"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Read Order" hint="e.g. 1, 1.5, 2">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={ccmf.read_order ?? ""}
            onChange={(e) => ucm("read_order", e.target.value)}
            placeholder="1"
          />
        </Field>
        <Field label="Main Entry">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!ccmf.is_main_entry}
              onChange={(e) => ucm("is_main_entry", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
              Main line entry (not a spinoff)
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-external-link-alt" title="Sources" />
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          Other Sources
        </label>
        <div className="space-y-2">
          {(ccmf.source_other || []).map((entry, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls}
                placeholder="Source name"
                value={entry.name}
                onChange={(e) =>
                  ucm(
                    "source_other",
                    (ccmf.source_other || []).map((x, j) =>
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
                  ucm(
                    "source_other",
                    (ccmf.source_other || []).map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="text-red-400 hover:text-red-600 px-1 shrink-0"
                onClick={() =>
                  ucm(
                    "source_other",
                    (ccmf.source_other || []).filter((_, j) => j !== i),
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
              ucm("source_other", [
                ...(ccmf.source_other || []),
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
              checked={!!ccmf.read_next}
              onChange={(e) => ucm("read_next", e.target.checked)}
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
              checked={!!ccmf.to_reread}
              onChange={(e) => ucm("to_reread", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
              Mark for reread
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
      <Field label="Cover Image File" hint="e.g. 5114.jpg">
        <input
          className={inputCls}
          value={ccmf.cover_image_file || ""}
          onChange={(e) => ucm("cover_image_file", e.target.value)}
          placeholder="5114.jpg"
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={ccmf.remark || ""}
          onChange={(e) => ucm("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </>
  );
}
