// Frontend: add tab page file for AnimeAddTab.
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import ReleaseDateInput from "../../components/forms/ReleaseDateInput";
import CastEditor from "../../components/forms/CastEditor";
import SourcesEditor from "../../components/forms/SourcesEditor";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getDisplayName, getSourceValues } from "../../utils/media";
import { WEEKDAYS } from "../../config/weekdays";
import { broadcastTimeOptions } from "../../config/broadcastTimes";
import {
  AIRING_STATUSES,
  ANIME_AIRING_TYPES,
  IS_MAIN,
  MY_RATINGS,
  PART_NUMS,
  RELEASE_SEASONS,
  SEASON_NUMS,
  WATCHING_STATUSES,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";

export { defaultAnime } from "../../config/formFactories";

export default function AnimeAddTab({
  franchiseCollections,
  af,
  ua,
  fillQuery,
  setFillQuery,
  fillOpen,
  setFillOpen,
  fillRef,
  fillResults,
  applyAutofill,
  allFranchises,
  franchiseItems,
  seriesItemsForAnime,
  sources,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      {/* Auto-fill search */}
      <div ref={fillRef} className="relative mb-4">
        <div className="flex items-center gap-2 bg-brand-soft border border-brand/20 rounded-xl px-4 py-2.5">
          <i className="fas fa-magic text-brand text-sm"></i>
          <input
            type="text"
            value={fillQuery}
            onChange={(e) => {
              setFillQuery(e.target.value);
              setFillOpen(true);
            }}
            onFocus={() => setFillOpen(true)}
            placeholder="Auto-fill from existing entry — type a name to search..."
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-text-muted placeholder-text-faint"
            autoComplete="off"
          />
          {fillQuery && (
            <button
              type="button"
              onClick={() => {
                setFillQuery("");
                setFillOpen(false);
              }}
              className="text-text-faint hover:text-text-muted"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
        {fillOpen && fillResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {fillResults.map((a) => {
              const f = allFranchises.find(
                (x) => x.system_id === a.franchise_id,
              );
              return (
                <button
                  key={a.system_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyAutofill(a)}
                  className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {a.airing_type && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-surface-2 text-text-faint shrink-0">
                        {a.airing_type}
                      </span>
                    )}
                    <span className="text-sm font-bold text-text">
                      {a.anime_name_cn || a.anime_name_en}
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

      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Franchise">
          <ComboBox
            items={franchiseItems}
            selectedId={af.franchise_id}
            inputText={af.franchise_text}
            onSelect={(id, label) =>
              ua("franchise_id", id) || ua("franchise_text", label)
            }
            onType={(text) => {
              ua("franchise_text", text);
              ua("franchise_id", null);
            }}
            onClear={() => {
              ua("franchise_id", null);
              ua("franchise_text", "");
            }}
            placeholder="Search or type new franchise..."
            allowNew
          />
          <CollectionNote
            franchiseId={af.franchise_id}
            franchiseCollections={franchiseCollections}
          />
        </Field>
        <Field label="Series">
          <ComboBox
            items={seriesItemsForAnime}
            selectedId={af.series_id}
            inputText={af.series_text}
            onSelect={(id, label) => {
              ua("series_id", id);
              ua("series_text", label);
            }}
            onType={(text) => {
              ua("series_text", text);
              ua("series_id", null);
            }}
            onClear={() => {
              ua("series_id", null);
              ua("series_text", "");
            }}
            placeholder="Search or type new series..."
            allowNew
          />
        </Field>
      </div>
      <Field label="Anime Name EN" required>
        <input
          className={inputCls}
          value={af.anime_name_en}
          onChange={(e) => ua("anime_name_en", e.target.value)}
          placeholder="English title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Anime Name CN">
          <input
            className={inputCls}
            value={af.anime_name_cn}
            onChange={(e) => ua("anime_name_cn", e.target.value)}
            placeholder="Chinese title"
          />
        </Field>
        <Field label="Anime Name roman">
          <input
            className={inputCls}
            value={af.anime_name_roman}
            onChange={(e) => ua("anime_name_roman", e.target.value)}
            placeholder="Romanized title"
          />
        </Field>
        <Field label="Anime Name JP">
          <input
            className={inputCls}
            value={af.anime_name_jp}
            onChange={(e) => ua("anime_name_jp", e.target.value)}
            placeholder="Japanese title"
          />
        </Field>
        <Field label="Anime Name Alt">
          <input
            className={inputCls}
            value={af.anime_name_alt}
            onChange={(e) => ua("anime_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Season">
          <select
            className={selectCls}
            value={af.season_num}
            onChange={(e) => ua("season_num", e.target.value)}
          >
            <option value="">—</option>
            {SEASON_NUMS.map((n) => (
              <option key={n} value={n}>
                Season {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Part">
          <select
            className={selectCls}
            value={af.part_num}
            onChange={(e) => ua("part_num", e.target.value)}
          >
            <option value="">—</option>
            {PART_NUMS.map((n) => (
              <option key={n} value={n}>
                Part {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status & Progress" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Airing Status">
          <select
            className={selectCls}
            value={af.airing_status}
            onChange={(e) => ua("airing_status", e.target.value)}
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
            value={af.watching_status}
            onChange={(e) => ua("watching_status", e.target.value)}
          >
            <StatusOptions statuses={WATCHING_STATUSES} />
          </select>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={af.my_rating}
            onChange={(e) => ua("my_rating", e.target.value)}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Broadcast Day">
          <select
            className={selectCls}
            value={af.broadcast_day}
            onChange={(e) => ua("broadcast_day", e.target.value)}
          >
            <option value="">—</option>
            {WEEKDAYS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Broadcast Time">
          <select
            className={selectCls}
            value={af.broadcast_time}
            onChange={(e) => ua("broadcast_time", e.target.value)}
          >
            <option value="">—</option>
            {broadcastTimeOptions(af.broadcast_time).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="My Watch Day">
          <select
            className={selectCls}
            value={af.my_watch_day}
            onChange={(e) => ua("my_watch_day", e.target.value)}
          >
            <option value="">—</option>
            {WEEKDAYS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="EP Previous">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={af.ep_previous}
            onChange={(e) => ua("ep_previous", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="EP Total">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={af.ep_total}
            onChange={(e) => ua("ep_total", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="EP Finished">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={af.ep_fin}
            onChange={(e) => ua("ep_fin", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="EP Special">
          <input
            className={inputCls}
            type="number"
            min="0"
            step="0.01"
            value={af.ep_special}
            onChange={(e) => ua("ep_special", e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="MAL Rating">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            min="0"
            max="10"
            value={af.mal_rating}
            onChange={(e) => ua("mal_rating", e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="MAL Rank">
          <input
            className={inputCls}
            value={af.mal_rank}
            onChange={(e) => ua("mal_rank", e.target.value)}
            placeholder="#1234"
          />
        </Field>
        <Field label="AniList Rating">
          <input
            className={inputCls}
            value={af.anilist_rating}
            onChange={(e) => ua("anilist_rating", e.target.value)}
            placeholder="e.g. 85%"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-tags" title="Classification" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Airing Type">
          <select
            className={selectCls}
            value={af.airing_type}
            onChange={(e) => ua("airing_type", e.target.value)}
          >
            <option value="">—</option>
            {ANIME_AIRING_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Main / Spinoff">
          <select
            className={selectCls}
            value={af.is_main}
            onChange={(e) => ua("is_main", e.target.value)}
          >
            <option value="">—</option>
            {IS_MAIN.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Genre Main">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "option",
              category: "Genre Main",
            })}
            value={af.genre_main}
            onChange={(v) => ua("genre_main", v)}
            placeholder="Select genres..."
            limit={null}
          />
        </Field>
        <Field label="Genre Sub">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "option",
              category: "Genre Sub",
            })}
            value={af.genre_sub}
            onChange={(v) => ua("genre_sub", v)}
            placeholder="Select sub-genres..."
            limit={null}
          />
        </Field>
        <Field label="標籤 Label">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "option",
              category: "Label",
            })}
            value={af.label}
            onChange={(v) => ua("label", v)}
            placeholder="Select labels..."
            limit={null}
          />
        </Field>
        <Field label="Quality 品質">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "option",
              category: "Quality",
            })}
            value={af.quality}
            onChange={(v) => ua("quality", v)}
            placeholder="Select qualities..."
            limit={null}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-industry" title="Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Release Season">
          <select
            className={selectCls}
            value={af.release_season}
            onChange={(e) => ua("release_season", e.target.value)}
          >
            <option value="">—</option>
            {RELEASE_SEASONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <ReleaseDateInput
          label="Release Date"
          value={af.release_date}
          onChange={(v) => ua("release_date", v)}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Studio">
          <MultiSelect
            options={getSourceValues(sources, { kind: "studio" })}
            value={af.studio}
            onChange={(v) => ua("studio", v)}
            placeholder="Select studio..."
            limit={null}
          />
        </Field>
        <Field label="Distributor TW">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "option",
              category: "Publisher / Distributor TW",
              scope: "anime",
            })}
            value={af.distributor_tw}
            onChange={(v) => ua("distributor_tw", v)}
            placeholder="Select distributor..."
            limit={null}
          />
        </Field>
        <Field label="Director">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "director",
              scope: "anime",
            })}
            value={af.director}
            onChange={(v) => ua("director", v)}
            placeholder="Select director..."
            limit={null}
          />
        </Field>
        <Field label="Producer">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "producer",
            })}
            value={af.producer}
            onChange={(v) => ua("producer", v)}
            placeholder="Select producer..."
            limit={null}
          />
        </Field>
        <Field label="Music / Composer">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "person",
              role: "composer",
            })}
            value={af.music}
            onChange={(v) => ua("music", v)}
            placeholder="Select composer..."
            limit={null}
          />
        </Field>
      </div>

      {/* Cast: character/seiyuu/role rows, saved separately via
          PUT /api/casting/anime/{id} once the entry exists - never part of
          the entry payload above. Not the "Seiyuu" Need/Done flag further
          down, which is an unrelated to-do status. */}
      <SectionHeader icon="fa-users" title="Cast" />
      <CastEditor
        mediaType="anime"
        value={af.cast}
        onChange={(rows) => ua("cast", rows)}
      />

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Is Main Entry">
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={!!af.is_main_entry}
              onChange={(e) => ua("is_main_entry", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-xs font-medium text-text-muted">
              Mark as main entry among alternatives
            </span>
          </label>
        </Field>
      </div>
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Watch Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!af.watch_next}
              onChange={(e) => ua("watch_next", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
              Add to Watch Next list
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="MAL ID">
          <input
            className={inputCls}
            type="number"
            value={af.mal_id}
            onChange={(e) => ua("mal_id", e.target.value)}
            placeholder="e.g. 5114"
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            type="url"
            value={af.mal_link}
            onChange={(e) => ua("mal_link", e.target.value)}
            placeholder="https://myanimelist.net/anime/..."
          />
        </Field>
        <Field label="Exclusive Source">
          <MultiSelect
            options={getSourceValues(sources, {
              kind: "option",
              category: "Platform",
              scope: "anime",
              usage: "origin",
            })}
            value={af.exclusive_source}
            onChange={(v) => ua("exclusive_source", v)}
            placeholder="Select exclusive platform..."
            limit={1}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-broadcast-tower" title="Sources" />
      <SourcesEditor
        value={af.sources}
        onChange={(rows) => ua("sources", rows)}
        mediaType="anime"
        sources={sources}
      />

      <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Seiyuu">
          <select
            className={selectCls}
            value={af.seiyuu}
            onChange={(e) => ua("seiyuu", e.target.value)}
          >
            <option value="">—</option>
            {["Need", "Done"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
        <input
          className={inputCls}
          value={af.cover_image_file}
          onChange={(e) => ua("cover_image_file", e.target.value)}
          placeholder="5114.jpg"
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={af.remark}
          onChange={(e) => ua("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </div>
  );
}
