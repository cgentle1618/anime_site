import BelongingNovelsEditor from "../../components/BelongingNovelsEditor";
import ComboBox from "../../components/ComboBox";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/FormField";
import { getDisplayName, parseTypes } from "../../utils/media";
import NovelNotes from "../NovelNotes";

const NOVEL_TYPES = ["Light Novel", "Novel", "Web", "Other"];
const SERIALIZATION_STATUSES = [
  "連載中",
  "連載中 (不穩定)",
  "連載中 (有生之年)",
  "停更",
  "完結",
  "腰斬",
  "可能更多",
  "未出",
];
const PROGRESS_DISPLAY_OPTIONS = [
  { value: "", label: "— Default (CH) —" },
  { value: "ch", label: "CH (Chapters)" },
  { value: "vol_tw", label: "VOL TW (Taiwan Volumes)" },
  { value: "vol_original", label: "VOL Original" },
  { value: "arc_ch", label: "ARC + CH" },
];

export default function NovelModifyTab({
  cnvf,
  unv,
  allFranchises,
  seriesItemsForNovel,
  editingItem,
  ribbonSection,
}) {
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Region">
          <select
            className={selectCls}
            value={cnvf.region || ""}
            onChange={(e) => unv("region", e.target.value)}
          >
            <option value="">—</option>
            {["JP", "CN", "TW", "KR", "Western"].map((v) => (
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
            {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
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
            value={cnvf.reading_status || "Might Read"}
            onChange={(e) => unv("reading_status", e.target.value)}
          >
            {[
              "Might Read",
              "Plan to Read",
              "Active Reading",
              "Passive Reading",
              "Paused",
              "Completed",
              "Temp Dropped",
              "Dropped",
              "Won't Read",
            ].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={cnvf.my_rating || ""}
            onChange={(e) => unv("my_rating", e.target.value)}
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

      <SectionHeader icon="fa-list-ol" title="Progress" />
      <Field label="Progress Display">
        <select
          className={selectCls}
          value={cnvf.progress_display || ""}
          onChange={(e) => unv("progress_display", e.target.value)}
        >
          {PROGRESS_DISPLAY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Vol Total (Original)">
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
          <input
            className={inputCls}
            value={cnvf.author || ""}
            onChange={(e) => unv("author", e.target.value)}
          />
        </Field>
        <Field label="Illustrator">
          <input
            className={inputCls}
            value={cnvf.illustrator || ""}
            onChange={(e) => unv("illustrator", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Release Year">
          <input
            className={inputCls}
            type="number"
            value={cnvf.release_year ?? ""}
            onChange={(e) => unv("release_year", e.target.value)}
          />
        </Field>
        <Field label="End Year">
          <input
            className={inputCls}
            type="number"
            value={cnvf.end_year ?? ""}
            onChange={(e) => unv("end_year", e.target.value)}
          />
        </Field>
        <Field label="Publisher TW">
          <input
            className={inputCls}
            value={cnvf.publisher_tw || ""}
            onChange={(e) => unv("publisher_tw", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Prequel ID">
          <input
            className={inputCls + " font-mono text-xs"}
            value={cnvf.prequel_id || ""}
            onChange={(e) => unv("prequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Sequel ID">
          <input
            className={inputCls + " font-mono text-xs"}
            value={cnvf.sequel_id || ""}
            onChange={(e) => unv("sequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Alternative IDs" hint="Comma-separated UUIDs">
          <input
            className={inputCls + " font-mono text-xs"}
            value={cnvf.alternative || ""}
            onChange={(e) => unv("alternative", e.target.value)}
            placeholder="uuid1, uuid2, ..."
          />
        </Field>
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

      <SectionHeader icon="fa-book-open" title="Belonging Novels" />
      <div className="space-y-4">
        <BelongingNovelsEditor
          items={cnvf.novel_name_each_cn || []}
          onChange={(val) => unv("novel_name_each_cn", val)}
          label="CN"
          placeholder="CN book name"
        />
        <BelongingNovelsEditor
          items={cnvf.novel_name_each_en || []}
          onChange={(val) => unv("novel_name_each_en", val)}
          label="EN"
          placeholder="EN book name"
        />
      </div>

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
        <Field label="AniList Link">
          <input
            className={inputCls}
            type="url"
            value={cnvf.anilist_link || ""}
            onChange={(e) => unv("anilist_link", e.target.value)}
          />
        </Field>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          Other Sources
        </label>
        <div className="space-y-2">
          {(cnvf.source_other || []).map((entry, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls}
                placeholder="Source name"
                value={entry.name}
                onChange={(e) =>
                  unv(
                    "source_other",
                    (cnvf.source_other || []).map((x, j) =>
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
                  unv(
                    "source_other",
                    (cnvf.source_other || []).map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="text-red-400 hover:text-red-600 px-1 shrink-0"
                onClick={() =>
                  unv(
                    "source_other",
                    (cnvf.source_other || []).filter((_, j) => j !== i),
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
              unv("source_other", [
                ...(cnvf.source_other || []),
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
              checked={!!cnvf.read_next}
              onChange={(e) => unv("read_next", e.target.checked)}
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
              checked={!!cnvf.to_reread}
              onChange={(e) => unv("to_reread", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
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
      <NovelNotes
        novel={{
          notes: cnvf.notes,
          system_id: editingItem?.system_id,
        }}
        isAdmin={true}
        onSave={(updatedNotes) => unv("notes", updatedNotes)}
      />
    </>
  );
}
