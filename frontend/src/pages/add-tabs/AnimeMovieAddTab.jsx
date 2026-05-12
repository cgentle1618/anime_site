import ComboBox from "../../components/ComboBox";
import MultiSelect from "../../components/MultiSelect";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/FormField";
import { getOptions } from "../../utils/anime";

export default function AnimeMovieAddTab({
  amf,
  uam,
  franchiseItems,
  allOptions,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
      <SectionHeader icon="fa-film" title="Titles & Naming" />
      <Field label="Franchise">
        <ComboBox
          items={franchiseItems}
          selectedId={amf.franchise_id}
          inputText={amf.franchise_text}
          onSelect={(id, label) => {
            uam("franchise_id", id);
            uam("franchise_text", label);
          }}
          onType={(text) => {
            uam("franchise_text", text);
            uam("franchise_id", null);
          }}
          onClear={() => {
            uam("franchise_id", null);
            uam("franchise_text", "");
          }}
          placeholder="Search or type new franchise..."
          allowNew
        />
      </Field>
      <Field label="Anime Movie Name EN" required>
        <input
          className={inputCls}
          value={amf.anime_movie_name_en}
          onChange={(e) => uam("anime_movie_name_en", e.target.value)}
          placeholder="English title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Anime Movie Name CN">
          <input
            className={inputCls}
            value={amf.anime_movie_name_cn}
            onChange={(e) => uam("anime_movie_name_cn", e.target.value)}
            placeholder="Chinese title"
          />
        </Field>
        <Field label="Anime Movie Name roman">
          <input
            className={inputCls}
            value={amf.anime_movie_name_roman}
            onChange={(e) => uam("anime_movie_name_roman", e.target.value)}
            placeholder="Romanized title"
          />
        </Field>
        <Field label="Anime Movie Name JP">
          <input
            className={inputCls}
            value={amf.anime_movie_name_jp}
            onChange={(e) => uam("anime_movie_name_jp", e.target.value)}
            placeholder="Japanese title"
          />
        </Field>
        <Field label="Anime Movie Name Alt">
          <input
            className={inputCls}
            value={amf.anime_movie_name_alt}
            onChange={(e) => uam("anime_movie_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status & Progress" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Airing Status">
          <select
            className={selectCls}
            value={amf.airing_status}
            onChange={(e) => uam("airing_status", e.target.value)}
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
            value={amf.watching_status}
            onChange={(e) => uam("watching_status", e.target.value)}
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
            value={amf.my_rating}
            onChange={(e) => uam("my_rating", e.target.value)}
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
        <Field label="MAL Rating">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            min="0"
            max="10"
            value={amf.mal_rating}
            onChange={(e) => uam("mal_rating", e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="MAL Rank">
          <input
            className={inputCls}
            value={amf.mal_rank}
            onChange={(e) => uam("mal_rank", e.target.value)}
            placeholder="#1234"
          />
        </Field>
        <Field label="AniList Rating">
          <input
            className={inputCls}
            value={amf.anilist_rating}
            onChange={(e) => uam("anilist_rating", e.target.value)}
            placeholder="e.g. 85%"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Watch Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!amf.watch_next}
              onChange={(e) => uam("watch_next", e.target.checked)}
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
              checked={!!amf.to_rewatch}
              onChange={(e) => uam("to_rewatch", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-gray-700">
              Mark for rewatch
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-info-circle" title="Release & Details" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Release Date JP" hint="YYYY-MM-DD">
          <input
            className={inputCls}
            type="date"
            value={amf.release_date_jp}
            onChange={(e) => uam("release_date_jp", e.target.value)}
          />
        </Field>
        <Field label="Release Date TW" hint="YYYY-MM-DD">
          <input
            className={inputCls}
            type="date"
            value={amf.release_date_tw}
            onChange={(e) => uam("release_date_tw", e.target.value)}
          />
        </Field>
        <Field label="Length (min)">
          <input
            className={inputCls}
            type="number"
            min="0"
            value={amf.length_min}
            onChange={(e) => uam("length_min", e.target.value)}
            placeholder="e.g. 120"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-video" title="Production" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Studio">
          <MultiSelect
            options={getOptions(allOptions, "Studio")}
            value={amf.studio}
            onChange={(v) => uam("studio", v)}
            placeholder="Select studio..."
          />
        </Field>
        <Field label="Director">
          <MultiSelect
            options={getOptions(allOptions, "Director")}
            value={amf.director}
            onChange={(v) => uam("director", v)}
            placeholder="Select director..."
          />
        </Field>
      </div>

      <SectionHeader icon="fa-external-link-alt" title="Source & Links" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="MAL ID">
          <input
            className={inputCls}
            type="number"
            value={amf.mal_id}
            onChange={(e) => uam("mal_id", e.target.value)}
            placeholder="e.g. 5114"
          />
        </Field>
        <Field label="MAL Link">
          <input
            className={inputCls}
            type="url"
            value={amf.mal_link}
            onChange={(e) => uam("mal_link", e.target.value)}
            placeholder="https://myanimelist.net/anime/..."
          />
        </Field>
        <Field label="AniList Link">
          <input
            className={inputCls}
            type="url"
            value={amf.anilist_link}
            onChange={(e) => uam("anilist_link", e.target.value)}
            placeholder="https://anilist.co/anime/..."
          />
        </Field>
        <Field label="Official Website">
          <input
            className={inputCls}
            type="url"
            value={amf.official_link}
            onChange={(e) => uam("official_link", e.target.value)}
            placeholder="https://..."
          />
        </Field>
        <Field label="Twitter Link">
          <input
            className={inputCls}
            type="url"
            value={amf.twitter_link}
            onChange={(e) => uam("twitter_link", e.target.value)}
            placeholder="https://twitter.com/..."
          />
        </Field>
      </div>

      <SectionHeader icon="fa-broadcast-tower" title="Source Availability" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Bahamut Source">
          <select
            className={selectCls}
            value={amf.source_baha}
            onChange={(e) => uam("source_baha", e.target.value)}
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
            value={amf.baha_link}
            onChange={(e) => uam("baha_link", e.target.value)}
            placeholder="https://ani.gamer.com.tw/..."
          />
        </Field>
        <Field label="Netflix Source">
          <select
            className={selectCls}
            value={amf.source_netflix}
            onChange={(e) => uam("source_netflix", e.target.value)}
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
            {amf.source_other.map((entry, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className={inputCls}
                  placeholder="Source name"
                  value={entry.name}
                  onChange={(e) =>
                    uam(
                      "source_other",
                      amf.source_other.map((x, j) =>
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
                    uam(
                      "source_other",
                      amf.source_other.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="text-red-400 hover:text-red-600 px-1 shrink-0"
                  onClick={() =>
                    uam(
                      "source_other",
                      amf.source_other.filter((_, j) => j !== i),
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
                uam("source_other", [
                  ...amf.source_other,
                  { name: "", url: "" },
                ])
              }
            >
              + Add Source
            </button>
          </div>
        </div>
      </div>

      <SectionHeader icon="fa-image" title="Cover & Notes" />
      <Field label="Cover Image File" hint="e.g. 5114.jpg or https://...">
        <input
          className={inputCls}
          value={amf.cover_image_file}
          onChange={(e) => uam("cover_image_file", e.target.value)}
          placeholder="5114.jpg"
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={amf.remark}
          onChange={(e) => uam("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </div>
  );
}
