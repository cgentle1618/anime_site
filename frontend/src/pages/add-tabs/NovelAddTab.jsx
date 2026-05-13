import BelongingNovelsEditor from "../../components/BelongingNovelsEditor";
import ComboBox from "../../components/ComboBox";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/FormField";
import { getDisplayName, parseTypes } from "../../utils/media";

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

export const defaultNovel = () => ({
  novel_name_cn: "",
  novel_name_en: "",
  novel_name_roman: "",
  novel_name_jp: "",
  novel_name_alt: "",
  franchise_id: null,
  franchise_text: "",
  series_id: null,
  series_text: "",
  region: "",
  type: "",
  version: "",
  is_main: "本傳",
  serialization_status: "",
  reading_status: "Might Read",
  progress_display: "",
  vol_total_original: "",
  vol_total_tw: "",
  vol_fin: "",
  arc_total: "",
  arc_fin: "",
  ch_total: "",
  ch_fin: "",
  my_rating: "",
  mal_rating: "",
  mal_rank: "",
  anilist_rating: "",
  author: "",
  illustrator: "",
  release_year: "",
  end_year: "",
  publisher_tw: "",
  prequel_id: null,
  sequel_id: null,
  alternative: "",
  read_order: "",
  novel_name_each_cn: [],
  novel_name_each_en: [],
  mal_id: "",
  mal_link: "",
  anilist_link: "",
  source_other: [],
  read_next: false,
  to_reread: false,
  cover_image_file: "",
  remark: "",
});

export default function NovelAddTab({
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
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
      {/* Auto-fill search */}
      <div ref={novelFillRef} className="relative mb-4">
        <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 rounded-xl px-4 py-2.5">
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
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-gray-700 placeholder-gray-400"
            autoComplete="off"
          />
          {novelFillQuery && (
            <button
              type="button"
              onClick={() => {
                setNovelFillQuery("");
                setNovelFillOpen(false);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
        {novelFillOpen && novelFillResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
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
                  className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {n.region && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                        {n.region}
                      </span>
                    )}
                    <span className="text-sm font-bold text-gray-800">
                      {n.novel_name_cn || n.novel_name_en}
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
            {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
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
            value={nvf.my_rating}
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
      <Field label="Progress Display" hint="Which tracker to show on the card">
        <select
          className={selectCls}
          value={nvf.progress_display}
          onChange={(e) => unv("progress_display", e.target.value)}
        >
          {PROGRESS_DISPLAY_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Vol Total (Original)">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <input
            className={inputCls}
            value={nvf.author}
            onChange={(e) => unv("author", e.target.value)}
            placeholder="Author name"
          />
        </Field>
        <Field label="Illustrator">
          <input
            className={inputCls}
            value={nvf.illustrator}
            onChange={(e) => unv("illustrator", e.target.value)}
            placeholder="Illustrator name"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Release Year">
          <input
            className={inputCls}
            type="number"
            value={nvf.release_year}
            onChange={(e) => unv("release_year", e.target.value)}
            placeholder="2020"
          />
        </Field>
        <Field label="End Year">
          <input
            className={inputCls}
            type="number"
            value={nvf.end_year}
            onChange={(e) => unv("end_year", e.target.value)}
            placeholder="2024"
          />
        </Field>
        <Field label="Publisher TW">
          <input
            className={inputCls}
            value={nvf.publisher_tw}
            onChange={(e) => unv("publisher_tw", e.target.value)}
            placeholder="e.g. 台灣角川"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Prequel ID" hint="UUID of prequel entry">
          <input
            className={inputCls + " font-mono text-xs"}
            value={nvf.prequel_id || ""}
            onChange={(e) => unv("prequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Sequel ID" hint="UUID of sequel entry">
          <input
            className={inputCls + " font-mono text-xs"}
            value={nvf.sequel_id || ""}
            onChange={(e) => unv("sequel_id", e.target.value || null)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>
        <Field label="Alternative IDs" hint="Comma-separated UUIDs">
          <input
            className={inputCls + " font-mono text-xs"}
            value={nvf.alternative || ""}
            onChange={(e) => unv("alternative", e.target.value)}
            placeholder="uuid1, uuid2, ..."
          />
        </Field>
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
      <SectionHeader icon="fa-book-open" title="Belonging Novels" />
      <div className="space-y-4">
        <BelongingNovelsEditor
          items={nvf.novel_name_each_cn}
          onChange={(val) => unv("novel_name_each_cn", val)}
          label="CN"
          placeholder="CN book name"
        />
        <BelongingNovelsEditor
          items={nvf.novel_name_each_en}
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
        <Field label="AniList Link">
          <input
            className={inputCls}
            type="url"
            value={nvf.anilist_link}
            onChange={(e) => unv("anilist_link", e.target.value)}
            placeholder="https://anilist.co/manga/..."
          />
        </Field>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          Other Sources
        </label>
        <div className="space-y-2">
          {nvf.source_other.map((entry, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls}
                placeholder="Source name"
                value={entry.name}
                onChange={(e) =>
                  unv(
                    "source_other",
                    nvf.source_other.map((x, j) =>
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
                    nvf.source_other.map((x, j) =>
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
                    nvf.source_other.filter((_, j) => j !== i),
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
              unv("source_other", [...nvf.source_other, { name: "", url: "" }])
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
              checked={!!nvf.read_next}
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
              checked={!!nvf.to_reread}
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
