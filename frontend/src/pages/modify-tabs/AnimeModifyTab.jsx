// Frontend: modify tab page file for AnimeModifyTab.
import ComboBox from "../../components/forms/ComboBox";
import MultiSelect from "../../components/forms/MultiSelect";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import { getOptions } from "../../utils/media";
import { WEEKDAYS } from "../../config/weekdays";
import { broadcastTimeOptions } from "../../config/broadcastTimes";
import AnimeNotes from "../detail/AnimeNotes";

export default function AnimeModifyTab({
  af,
  ua,
  franchiseItems,
  seriesItemsForAnime,
  allOptions,
  editingItem,
}) {
  return (
    <>
      <SectionHeader icon="fa-tag" title="Titles & Naming" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Franchise">
          <ComboBox
            items={franchiseItems}
            selectedId={af.franchise_id}
            inputText={af.franchise_text}
            onSelect={(id, label) => {
              ua("franchise_id", id);
              ua("franchise_text", label);
            }}
            onType={(text) => {
              ua("franchise_text", text);
              ua("franchise_id", null);
            }}
            onClear={() => {
              ua("franchise_id", null);
              ua("franchise_text", "");
            }}
            placeholder="Search franchise..."
            allowNew
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
            placeholder="Search series..."
            allowNew
          />
        </Field>
      </div>
      <Field label="Anime Name EN" required>
        <input
          className={inputCls}
          value={af.anime_name_en}
          onChange={(e) => ua("anime_name_en", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Anime Name CN">
          <input
            className={inputCls}
            value={af.anime_name_cn}
            onChange={(e) => ua("anime_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Anime Name roman">
          <input
            className={inputCls}
            value={af.anime_name_roman}
            onChange={(e) => ua("anime_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Anime Name JP">
          <input
            className={inputCls}
            value={af.anime_name_jp}
            onChange={(e) => ua("anime_name_jp", e.target.value)}
          />
        </Field>
        <Field label="Anime Name Alt">
          <input
            className={inputCls}
            value={af.anime_name_alt}
            onChange={(e) => ua("anime_name_alt", e.target.value)}
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
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
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
            {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
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
            value={af.watching_status}
            onChange={(e) => ua("watching_status", e.target.value)}
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
        <Field label="My Rating">
          <select
            className={selectCls}
            value={af.my_rating}
            onChange={(e) => ua("my_rating", e.target.value)}
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
          />
        </Field>
        <Field label="EP Total">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={af.ep_total}
            onChange={(e) => ua("ep_total", e.target.value)}
          />
        </Field>
        <Field label="EP Finished">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={af.ep_fin}
            onChange={(e) => ua("ep_fin", e.target.value)}
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
          />
        </Field>
        <Field label="MAL Rank">
          <input
            className={inputCls}
            value={af.mal_rank}
            onChange={(e) => ua("mal_rank", e.target.value)}
          />
        </Field>
        <Field label="AniList Rating">
          <input
            className={inputCls}
            value={af.anilist_rating}
            onChange={(e) => ua("anilist_rating", e.target.value)}
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
            {["TV", "Movie", "ONA", "OVA", "OAD", "Special", "Other"].map(
              (v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Main / Spinoff">
          <select
            className={selectCls}
            value={af.is_main}
            onChange={(e) => ua("is_main", e.target.value)}
          >
            <option value="">—</option>
            {["本傳", "外傳", "前傳", "後傳", "總集篇"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Genre Main">
          <MultiSelect
            options={getOptions(allOptions, "Genre Main")}
            value={af.genre_main}
            onChange={(v) => ua("genre_main", v)}
            placeholder="Select genres..."
            limit={null}
          />
        </Field>
        <Field label="Genre Sub">
          <MultiSelect
            options={getOptions(allOptions, "Genre Sub")}
            value={af.genre_sub}
            onChange={(v) => ua("genre_sub", v)}
            placeholder="Select sub-genres..."
            limit={null}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-industry" title="Production" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Release Season">
          <select
            className={selectCls}
            value={af.release_season}
            onChange={(e) => ua("release_season", e.target.value)}
          >
            <option value="">—</option>
            {["WIN", "SPR", "SUM", "FAL"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Release Month">
          <select
            className={selectCls}
            value={af.release_month}
            onChange={(e) => ua("release_month", e.target.value)}
          >
            <option value="">—</option>
            {[
              "JAN",
              "FEB",
              "MAR",
              "APR",
              "MAY",
              "JUN",
              "JUL",
              "AUG",
              "SEP",
              "OCT",
              "NOV",
              "DEC",
            ].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Release Year">
          <input
            className={inputCls}
            value={af.release_year}
            onChange={(e) => ua("release_year", e.target.value)}
            placeholder="YYYY"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Studio">
          <MultiSelect
            options={getOptions(allOptions, "Studio")}
            value={af.studio}
            onChange={(v) => ua("studio", v)}
            placeholder="Select studio..."
            limit={null}
          />
        </Field>
        <Field label="Distributor TW">
          <MultiSelect
            options={getOptions(allOptions, "Distributor TW")}
            value={af.distributor_tw}
            onChange={(v) => ua("distributor_tw", v)}
            placeholder="Select distributor..."
            limit={null}
          />
        </Field>
        <Field label="Director">
          <MultiSelect
            options={getOptions(allOptions, "Director")}
            value={af.director}
            onChange={(v) => ua("director", v)}
            placeholder="Select director..."
            limit={null}
          />
        </Field>
        <Field label="Producer">
          <MultiSelect
            options={getOptions(allOptions, "Producer")}
            value={af.producer}
            onChange={(v) => ua("producer", v)}
            placeholder="Select producer..."
            limit={null}
          />
        </Field>
        <Field label="Music / Composer">
          <MultiSelect
            options={getOptions(allOptions, "Music / Composer")}
            value={af.music}
            onChange={(v) => ua("music", v)}
            placeholder="Select composer..."
            limit={null}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-link" title="Relational & Timeline" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Prequel ID" hint="UUID">
          <input
            className={inputCls + " font-mono text-xs"}
            value={af.prequel_id || ""}
            onChange={(e) => ua("prequel_id", e.target.value || null)}
          />
        </Field>
        <Field label="Sequel ID" hint="UUID">
          <input
            className={inputCls + " font-mono text-xs"}
            value={af.sequel_id || ""}
            onChange={(e) => ua("sequel_id", e.target.value || null)}
          />
        </Field>
        <Field label="Alternative IDs" hint="Comma-separated UUIDs">
          <input
            className={inputCls + " font-mono text-xs"}
            value={af.alternative}
            onChange={(e) => ua("alternative", e.target.value)}
          />
        </Field>
        <Field label="Is Main Entry">
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={!!af.is_main_entry}
              onChange={(e) => ua("is_main_entry", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-xs font-medium text-gray-700">
              Mark as main entry among alternatives
            </span>
          </label>
        </Field>
        <Field label="Watch Order">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={af.watch_order}
            onChange={(e) => ua("watch_order", e.target.value)}
          />
        </Field>
        <Field
          label="Derive Related"
          hint="Set to No to skip prequel/sequel derivation"
        >
          <select
            className={selectCls}
            value={af.derive_related}
            onChange={(e) => ua("derive_related", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
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
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            type="url"
            value={af.mal_link}
            onChange={(e) => ua("mal_link", e.target.value)}
          />
        </Field>
        <Field label="AniList Link">
          <input
            className={inputCls}
            type="url"
            value={af.anilist_link}
            onChange={(e) => ua("anilist_link", e.target.value)}
          />
        </Field>
        <Field label="Official Website">
          <input
            className={inputCls}
            type="url"
            value={af.official_link}
            onChange={(e) => ua("official_link", e.target.value)}
          />
        </Field>
        <Field label="Twitter Link">
          <input
            className={inputCls}
            type="url"
            value={af.twitter_link}
            onChange={(e) => ua("twitter_link", e.target.value)}
          />
        </Field>
      </div>

      <SectionHeader icon="fa-broadcast-tower" title="Source Availability" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Bahamut Source">
          <select
            className={selectCls}
            value={af.source_baha}
            onChange={(e) => ua("source_baha", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">有 (Yes)</option>
            <option value="false">無 (No)</option>
          </select>
        </Field>
        <Field label="Bahamut Link">
          <input
            className={inputCls}
            type="url"
            value={af.baha_link}
            onChange={(e) => ua("baha_link", e.target.value)}
          />
        </Field>
        <Field label="Netflix Source">
          <select
            className={selectCls}
            value={af.source_netflix}
            onChange={(e) => ua("source_netflix", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">有 (Yes)</option>
            <option value="false">無 (No)</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
            Other Sources
          </label>
          <div className="space-y-2">
            {af.source_other.map((entry, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className={inputCls}
                  placeholder="Source name (e.g. Crunchyroll)"
                  value={entry.name}
                  onChange={(e) =>
                    ua(
                      "source_other",
                      af.source_other.map((x, j) =>
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
                    ua(
                      "source_other",
                      af.source_other.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="text-red-400 hover:text-red-600 px-1 shrink-0"
                  onClick={() =>
                    ua(
                      "source_other",
                      af.source_other.filter((_, j) => j !== i),
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
                ua("source_other", [...af.source_other, { name: "", url: "" }])
              }
            >
              + Add Source
            </button>
          </div>
        </div>
      </div>

      <SectionHeader icon="fa-music" title="Notes & Other" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="OP">
          <select
            className={selectCls}
            value={af.op}
            onChange={(e) => ua("op", e.target.value)}
          >
            <option value="">—</option>
            {["Pending", "Need", "Done"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ED">
          <select
            className={selectCls}
            value={af.ed}
            onChange={(e) => ua("ed", e.target.value)}
          >
            <option value="">—</option>
            {["Pending", "Need", "Done"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Insert / OST">
          <select
            className={selectCls}
            value={af.insert_ost}
            onChange={(e) => ua("insert_ost", e.target.value)}
          >
            <option value="">—</option>
            {["Pending", "Need", "Done"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
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
      <Field label="Cover Image File" hint="e.g. 5114.jpg">
        <input
          className={inputCls}
          value={af.cover_image_file}
          onChange={(e) => ua("cover_image_file", e.target.value)}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={af.remark}
          onChange={(e) => ua("remark", e.target.value)}
        />
      </Field>

      <SectionHeader icon="fa-book-open" title="Structured Notes" />
      <AnimeNotes
        key={editingItem.system_id}
        anime={{ notes: af.notes, system_id: editingItem.system_id }}
        isAdmin={true}
        onSave={(updatedNotes) => ua("notes", updatedNotes)}
      />
    </>
  );
}

