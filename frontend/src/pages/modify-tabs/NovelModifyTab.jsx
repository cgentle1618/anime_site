// Frontend: modify tab page file for NovelModifyTab.
import NovelUnitsEditor from "../../components/forms/NovelUnitsEditor";
import {
  countsChapters,
  countsVolumes,
  progressDisplayOptions,
} from "../../lib/novelUnits";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import CastEditor from "../../components/forms/CastEditor";
import SourcesEditor from "../../components/forms/SourcesEditor";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, getSourceValues, parseTypes } from "../../utils/media";
import NovelNotes from "../detail/NovelNotes";
import {
  NOVEL_REGIONS,
  NOVEL_TYPES,
  IS_MAIN,
  NOVEL_SERIALIZATION_STATUSES as SERIALIZATION_STATUSES,
  READING_STATUSES,
  MY_RATINGS,
  withLegacyProgressDisplay,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";

export default function NovelModifyTab({
  franchiseCollections,
  cnvf,
  unv,
  allFranchises,
  seriesItemsForNovel,
  editingItem,
  ribbonSection,
  sources,
}) {
  const publisherOptions = getSourceValues(sources, {
    kind: "option",
    category: "Publisher / Distributor TW",
    scope: "novel",
  });
  const publisherItems = publisherOptions.map((v) => ({ id: v, label: v }));

  return (
    <>
      {ribbonSection}

      <SectionHeader icon="fa-book-open" title="Titles & Naming" />
      <Field label="Franchise">
        <ComboBox
          items={allFranchises
            .filter(
              (f) =>
                parseTypes(f.franchise_type).includes("Novel") ||
                parseTypes(f.franchise_type).includes("ACG") ||
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
          selectedId={cnvf.franchise_id}
          inputText={cnvf.franchise_text || ""}
          onSelect={(id, label) => {
            unv("franchise_id", id);
            unv("franchise_text", label);
            unv("series_id", null);
            unv("series_text", "");
          }}
          onType={(text) => {
            unv("franchise_text", text);
            unv("franchise_id", null);
            unv("series_id", null);
            unv("series_text", "");
          }}
          onClear={() => {
            unv("franchise_id", null);
            unv("franchise_text", "");
            unv("series_id", null);
            unv("series_text", "");
          }}
          placeholder="Search franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={cnvf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForNovel}
          selectedId={cnvf.series_id}
          inputText={cnvf.series_text || ""}
          onSelect={(id, label) => {
            unv("series_id", id);
            unv("series_text", label);
          }}
          onType={(text) => {
            unv("series_text", text);
            unv("series_id", null);
          }}
          onClear={() => {
            unv("series_id", null);
            unv("series_text", "");
          }}
          placeholder="Search series..."
          allowNew
        />
      </Field>
      <Field label="Novel Name CN">
        <input
          className={inputCls}
          value={cnvf.novel_name_cn || ""}
          onChange={(e) => unv("novel_name_cn", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Novel Name EN">
          <input
            className={inputCls}
            value={cnvf.novel_name_en || ""}
            onChange={(e) => unv("novel_name_en", e.target.value)}
          />
        </Field>
        <Field label="Novel Name Alt">
          <input
            className={inputCls}
            value={cnvf.novel_name_alt || ""}
            onChange={(e) => unv("novel_name_alt", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Novel Name Roman">
          <input
            className={inputCls}
            value={cnvf.novel_name_roman || ""}
            onChange={(e) => unv("novel_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Novel Name JP">
          <input
            className={inputCls}
            value={cnvf.novel_name_jp || ""}
            onChange={(e) => unv("novel_name_jp", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Field label="Region">
          <select
            className={selectCls}
            value={cnvf.region || ""}
            onChange={(e) => unv("region", e.target.value)}
          >
            <option value="">—</option>
            {NOVEL_REGIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select
            className={selectCls}
            value={cnvf.type || ""}
            onChange={(e) => unv("type", e.target.value)}
          >
            <option value="">—</option>
            {NOVEL_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Is Main">
          <select
            className={selectCls}
            value={cnvf.is_main || ""}
            onChange={(e) => unv("is_main", e.target.value)}
          >
            <option value="">—</option>
            {IS_MAIN.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Version">
          <input
            className={inputCls}
            value={cnvf.version || ""}
            onChange={(e) => unv("version", e.target.value)}
            placeholder="e.g. 陸版"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Serialization Status">
          <select
            className={selectCls}
            value={cnvf.serialization_status || ""}
            onChange={(e) => unv("serialization_status", e.target.value)}
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
            value={cnvf.reading_status}
            onChange={(e) => unv("reading_status", e.target.value)}
          >
            <StatusOptions statuses={READING_STATUSES} />
          </select>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={cnvf.my_rating || ""}
            onChange={(e) => unv("my_rating", e.target.value)}
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
      <Field label="Progress Display">
        <select
          className={selectCls}
          value={cnvf.progress_display || ""}
          onChange={(e) => unv("progress_display", e.target.value)}
          aria-label="Progress display"
        >
          {withLegacyProgressDisplay(
            progressDisplayOptions(cnvf),
            cnvf.progress_display,
          ).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      {/* Volume counters. Hidden for Web, which is read in chapters — the
          columns keep whatever they hold (a later print run, or a type change
          back) but are not edited from here. */}
      {countsVolumes(cnvf) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Total Volumes (JP/KR)">
            <input
              className={inputCls}
              type="number"
              step="any"
              value={cnvf.vol_total_original ?? ""}
              onChange={(e) => unv("vol_total_original", e.target.value)}
            />
          </Field>
          <Field label="Vol Total (TW)">
            <input
              className={inputCls}
              type="number"
              step="any"
              value={cnvf.vol_total_tw ?? ""}
              onChange={(e) => unv("vol_total_tw", e.target.value)}
            />
          </Field>
          <Field label="Vol Finished">
            <input
              className={inputCls}
              type="number"
              step="any"
              value={cnvf.vol_fin ?? ""}
              onChange={(e) => unv("vol_fin", e.target.value)}
            />
          </Field>
        </div>
      )}
      {/* Arc and chapter counters exist only for the types that count them.
          A Light Novel or a Novel counts volumes, and the server clears these
          columns on save, so offering the inputs would invite an edit that is
          discarded. Follows the Type dropdown live. */}
      {countsChapters(cnvf) && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Arc Total">
              <input
                className={inputCls}
                type="number"
                step="any"
                value={cnvf.arc_total ?? ""}
                onChange={(e) => unv("arc_total", e.target.value)}
              />
            </Field>
            <Field label="Arc Finished">
              <input
                className={inputCls}
                type="number"
                step="any"
                value={cnvf.arc_fin ?? ""}
                onChange={(e) => unv("arc_fin", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Ch Total">
              <input
                className={inputCls}
                type="number"
                step="any"
                value={cnvf.ch_total ?? ""}
                onChange={(e) => unv("ch_total", e.target.value)}
              />
            </Field>
            <Field label="Ch Finished">
              <input
                className={inputCls}
                type="number"
                step="any"
                value={cnvf.ch_fin ?? ""}
                onChange={(e) => unv("ch_fin", e.target.value)}
              />
            </Field>
          </div>
        </>
      )}

      <SectionHeader icon="fa-star" title="Scores" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="MAL Rating">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={cnvf.mal_rating ?? ""}
            onChange={(e) => unv("mal_rating", e.target.value)}
          />
        </Field>
        <Field label="MAL Rank">
          <input
            className={inputCls}
            type="number"
            value={cnvf.mal_rank ?? ""}
            onChange={(e) => unv("mal_rank", e.target.value)}
          />
        </Field>
        <Field label="AniList Rating">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={cnvf.anilist_rating ?? ""}
            onChange={(e) => unv("anilist_rating", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-pen-nib" title="Authors & Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Author">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "novel_author",
            })}
            value={cnvf.author || ""}
            onChange={(v) => unv("author", v)}
            placeholder="Select or type author..."
          />
        </Field>
        <Field label="Illustrator">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "novel_illustrator",
            })}
            value={cnvf.illustrator || ""}
            onChange={(v) => unv("illustrator", v)}
            placeholder="Select or type illustrator..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ReleaseDateInput
          label="Release Date"
          value={cnvf.release_date}
          onChange={(v) => unv("release_date", v)}
        />
        <ReleaseDateInput
          label="End Date"
          value={cnvf.end_date}
          onChange={(v) => unv("end_date", v)}
        />
        <Field label="Publisher TW">
          <ComboBox
            items={publisherItems}
            selectedId={
              publisherOptions.includes(cnvf.publisher_tw)
                ? cnvf.publisher_tw
                : null
            }
            inputText={cnvf.publisher_tw || ""}
            onSelect={(id) => unv("publisher_tw", id)}
            onType={(text) => unv("publisher_tw", text)}
            onClear={() => unv("publisher_tw", "")}
            placeholder="e.g. 台灣角川"
            allowNew
          />
        </Field>
      </div>

      {/* Cast: character/role rows (no seiyuu column - nobody voices anyone
          in a novel), loaded from and saved back to
          PUT /api/casting/novel/{id} separately from this form's own PUT -
          see Modify.jsx's loading/saving of cnvf.cast. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor
        mediaType="novel"
        value={cnvf.cast}
        onChange={(v) => unv("cast", v)}
      />

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Read Order">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={cnvf.read_order ?? ""}
            onChange={(e) => unv("read_order", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-book-open" title="Units" />
      <NovelUnitsEditor
        items={cnvf.units}
        novelType={cnvf.type}
        onChange={(val) => unv("units", val)}
      />

      <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="MAL ID">
          <input
            className={inputCls}
            type="number"
            value={cnvf.mal_id ?? ""}
            onChange={(e) => unv("mal_id", e.target.value)}
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            type="url"
            value={cnvf.mal_link || ""}
            onChange={(e) => unv("mal_link", e.target.value)}
          />
        </Field>
        <Field label="Open Library Link">
          <input
            className={inputCls}
            type="url"
            value={cnvf.openlibrary_link || ""}
            onChange={(e) => unv("openlibrary_link", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-broadcast-tower" title="Sources" />
      <SourcesEditor
        value={cnvf.sources}
        onChange={(rows) => unv("sources", rows)}
        mediaType="novel"
        sources={sources}
      />

      <SectionHeader icon="fa-flag" title="Flags" />
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Read Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!cnvf.read_next}
              onChange={(e) => unv("read_next", e.target.checked)}
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
              checked={!!cnvf.to_reread}
              onChange={(e) => unv("to_reread", e.target.checked)}
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
          value={cnvf.cover_image_file || ""}
          onChange={(e) => unv("cover_image_file", e.target.value)}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={cnvf.remark || ""}
          onChange={(e) => unv("remark", e.target.value)}
        />
      </Field>
      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      {/* `remark` is hidden here: the dedicated Remark field above edits the
          same singleton note row, and two editors for one row overwrite each
          other on Save Changes. */}
      <NovelNotes
        novel={{ system_id: editingItem?.system_id }}
        isAdmin={true}
        hideSections={["remark"]}
      />
    </>
  );
}
