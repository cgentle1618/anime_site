// Frontend: add tab page file for NovelAddTab.
import NovelUnitsEditor from "../../components/forms/NovelUnitsEditor";
import {
  countsChapters,
  countsVolumes,
  progressDisplayOptions,
} from "../../lib/novelUnits";
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
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import { getDisplayName, getSourceValues, parseTypes } from "../../utils/media";
import {
  IS_MAIN,
  MY_RATINGS,
  NOVEL_REGIONS,
  NOVEL_SERIALIZATION_STATUSES as SERIALIZATION_STATUSES,
  NOVEL_TYPES,
  READING_STATUSES,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";

export { defaultNovel } from "../../config/formFactories";

export default function NovelAddTab({
  franchiseCollections,
  nvf,
  unv,
  novelFillQuery,
  setNovelFillQuery,
  novelFillOpen,
  setNovelFillOpen,
  novelFillRef,
  novelFillResults,
  applyNovelAutofill,
  allFranchises,
  seriesItemsForNovel,
  sources,
}) {
  const publisherOptions = getSourceValues(sources, {
    kind: "option",
    category: "Publisher / Distributor TW",
    scope: "novel",
  });
  const publisherItems = publisherOptions.map((v) => ({ id: v, label: v }));
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      {/* Auto-fill search */}
      <div ref={novelFillRef} className="relative mb-4">
        <div className="flex items-center gap-2 bg-brand-soft border border-brand/20 rounded-xl px-4 py-2.5">
          <i className="fas fa-magic text-brand text-sm"></i>
          <input
            type="text"
            value={novelFillQuery}
            onChange={(e) => {
              setNovelFillQuery(e.target.value);
              setNovelFillOpen(true);
            }}
            onFocus={() => setNovelFillOpen(true)}
            placeholder="Auto-fill from existing entry — type a name to search..."
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-text-muted placeholder-text-faint"
            autoComplete="off"
          />
          {novelFillQuery && (
            <button
              type="button"
              onClick={() => {
                setNovelFillQuery("");
                setNovelFillOpen(false);
              }}
              className="text-text-faint hover:text-text-muted"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
        {novelFillOpen && novelFillResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {novelFillResults.map((n) => {
              const f = allFranchises.find(
                (x) => x.system_id === n.franchise_id,
              );
              return (
                <button
                  key={n.system_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyNovelAutofill(n)}
                  className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {n.region && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-surface-2 text-text-faint shrink-0">
                        {n.region}
                      </span>
                    )}
                    <span className="text-sm font-bold text-text">
                      {n.novel_name_cn || n.novel_name_en}
                    </span>
                  </div>
                  <div className="text-xs text-text-faint">
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
          selectedId={nvf.franchise_id}
          inputText={nvf.franchise_text}
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
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={nvf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForNovel}
          selectedId={nvf.series_id}
          inputText={nvf.series_text}
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
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
      <Field label="Novel Name CN">
        <input
          className={inputCls}
          value={nvf.novel_name_cn}
          onChange={(e) => unv("novel_name_cn", e.target.value)}
          placeholder="Chinese title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Novel Name EN">
          <input
            className={inputCls}
            value={nvf.novel_name_en}
            onChange={(e) => unv("novel_name_en", e.target.value)}
            placeholder="English title"
          />
        </Field>
        <Field label="Novel Name Alt">
          <input
            className={inputCls}
            value={nvf.novel_name_alt}
            onChange={(e) => unv("novel_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Novel Name Roman">
          <input
            className={inputCls}
            value={nvf.novel_name_roman}
            onChange={(e) => unv("novel_name_roman", e.target.value)}
            placeholder="Romanized title"
          />
        </Field>
        <Field label="Novel Name JP">
          <input
            className={inputCls}
            value={nvf.novel_name_jp}
            onChange={(e) => unv("novel_name_jp", e.target.value)}
            placeholder="Japanese title"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Field label="Region">
          <select
            className={selectCls}
            value={nvf.region}
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
            value={nvf.type}
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
            value={nvf.is_main}
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
            value={nvf.version}
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
            value={nvf.serialization_status}
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
            value={nvf.reading_status}
            onChange={(e) => unv("reading_status", e.target.value)}
          >
            <StatusOptions statuses={READING_STATUSES} />
          </select>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={nvf.my_rating}
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
      <Field label="Progress Display" hint="Which tracker to show on the card">
        <select
          className={selectCls}
          value={nvf.progress_display}
          onChange={(e) => unv("progress_display", e.target.value)}
          aria-label="Progress display"
        >
          {progressDisplayOptions(nvf).map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {/* Arc and chapter counters exist only for the types that count them -
          see the same gate in NovelModifyTab. */}
      {countsChapters(nvf) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Ch Total">
            <input
              className={inputCls}
              type="number"
              step="any"
              value={nvf.ch_total}
              onChange={(e) => unv("ch_total", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Ch Finished">
            <input
              className={inputCls}
              type="number"
              step="any"
              value={nvf.ch_fin}
              onChange={(e) => unv("ch_fin", e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
      )}
      {/* Volume counters - hidden for Web, see the same gate in
          NovelModifyTab. */}
      {countsVolumes(nvf) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Total Volumes (JP/KR)">
            <input
              className={inputCls}
              type="number"
              step="any"
              value={nvf.vol_total_original}
              onChange={(e) => unv("vol_total_original", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Vol Total (TW)">
            <input
              className={inputCls}
              type="number"
              step="any"
              value={nvf.vol_total_tw}
              onChange={(e) => unv("vol_total_tw", e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
      )}
      {/* Vol Finished sits with the arc counters, and either half can be
          hidden, so the column count follows whatever actually renders. Both
          class strings are written out in full for Tailwind's scanner. */}
      <div
        className={`grid grid-cols-1 ${
          countsVolumes(nvf) && countsChapters(nvf)
            ? "md:grid-cols-3"
            : countsChapters(nvf)
              ? "md:grid-cols-2"
              : "md:grid-cols-1"
        } gap-4`}
      >
        {countsVolumes(nvf) && (
          <Field label="Vol Finished">
            <input
              className={inputCls}
              type="number"
              step="any"
              value={nvf.vol_fin}
              onChange={(e) => unv("vol_fin", e.target.value)}
              placeholder="0"
            />
          </Field>
        )}
        {countsChapters(nvf) && (
          <>
            <Field label="Arc Total">
              <input
                className={inputCls}
                type="number"
                step="any"
                value={nvf.arc_total}
                onChange={(e) => unv("arc_total", e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Arc Finished">
              <input
                className={inputCls}
                type="number"
                step="any"
                value={nvf.arc_fin}
                onChange={(e) => unv("arc_fin", e.target.value)}
                placeholder="0"
              />
            </Field>
          </>
        )}
      </div>

      <SectionHeader icon="fa-star" title="Scores" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="MAL Rating" hint="e.g. 8.5">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={nvf.mal_rating}
            onChange={(e) => unv("mal_rating", e.target.value)}
            placeholder="8.5"
          />
        </Field>
        <Field label="MAL Rank">
          <input
            className={inputCls}
            type="number"
            value={nvf.mal_rank}
            onChange={(e) => unv("mal_rank", e.target.value)}
            placeholder="100"
          />
        </Field>
        <Field label="AniList Rating">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={nvf.anilist_rating}
            onChange={(e) => unv("anilist_rating", e.target.value)}
            placeholder="85"
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
            value={nvf.author}
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
            value={nvf.illustrator}
            onChange={(v) => unv("illustrator", v)}
            placeholder="Select or type illustrator..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ReleaseDateInput
          label="Release Date"
          value={nvf.release_date}
          onChange={(v) => unv("release_date", v)}
        />
        <ReleaseDateInput
          label="End Date"
          value={nvf.end_date}
          onChange={(v) => unv("end_date", v)}
        />
        <Field label="Publisher TW">
          <ComboBox
            items={publisherItems}
            selectedId={
              publisherOptions.includes(nvf.publisher_tw)
                ? nvf.publisher_tw
                : null
            }
            inputText={nvf.publisher_tw || ""}
            onSelect={(id) => unv("publisher_tw", id)}
            onType={(text) => unv("publisher_tw", text)}
            onClear={() => unv("publisher_tw", "")}
            placeholder="e.g. 台灣角川"
            allowNew
          />
        </Field>
      </div>

      {/* Cast: character/role rows (no seiyuu column - nobody voices anyone
          in a novel), saved separately via PUT /api/casting/novel/{id} once
          the entry exists - never part of the entry payload above. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor
        mediaType="novel"
        value={nvf.cast}
        onChange={(v) => unv("cast", v)}
      />

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Read Order" hint="e.g. 1, 1.5, 2">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={nvf.read_order}
            onChange={(e) => unv("read_order", e.target.value)}
            placeholder="1"
          />
        </Field>
      </div>
      <SectionHeader icon="fa-book-open" title="Units" />
      <NovelUnitsEditor
        items={nvf.units}
        novelType={nvf.type}
        onChange={(val) => unv("units", val)}
      />

      <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="MAL ID">
          <input
            className={inputCls}
            type="number"
            value={nvf.mal_id}
            onChange={(e) => unv("mal_id", e.target.value)}
            placeholder="12345"
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            type="url"
            value={nvf.mal_link}
            onChange={(e) => unv("mal_link", e.target.value)}
            placeholder="https://myanimelist.net/manga/..."
          />
        </Field>
        <Field label="Open Library Link">
          <input
            className={inputCls}
            type="url"
            value={nvf.openlibrary_link}
            onChange={(e) => unv("openlibrary_link", e.target.value)}
            placeholder="https://openlibrary.org/works/OL..."
          />
        </Field>
      </div>

      <SectionHeader icon="fa-broadcast-tower" title="Sources" />
      <SourcesEditor
        value={nvf.sources}
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
              checked={!!nvf.read_next}
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
              checked={!!nvf.to_reread}
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
      <Field label="Cover Image File" hint="e.g. 5114.jpg">
        <input
          className={inputCls}
          value={nvf.cover_image_file}
          onChange={(e) => unv("cover_image_file", e.target.value)}
          placeholder="5114.jpg"
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={nvf.remark}
          onChange={(e) => unv("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </div>
  );
}
