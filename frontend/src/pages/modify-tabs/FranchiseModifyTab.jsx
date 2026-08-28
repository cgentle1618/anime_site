// Frontend: modify tab page file for FranchiseModifyTab.
import { getDisplayName, parseTypes } from "../../utils/media";
import { releaseYear } from "../../lib/releaseDate";
import {
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import ComboBox from "../../components/forms/ComboBox";
import { FRANCHISE_TYPES } from "../../config/fieldOptions";

const TYPE_TO_ENTRY_TYPES = {
  ACG: ["anime", "manga"],
  "Anime Movie": ["anime_movie"],
  TV: ["tv-show"],
  Movie: ["movie"],
  Cartoon: ["cartoon"],
  Novel: ["novel"],
  Comic: ["comic"],
};

function getEntryYear(e) {
  const d =
    e.release_date_jp ||
    e.release_date_tw ||
    e.release_date_usa ||
    e.release_date;
  if (d) return parseInt(String(d).slice(0, 4), 10) || 0;
  return 0;
}

export default function FranchiseModifyTab({
  ff,
  uf,
  allAnime,
  allAnimeMovies,
  allMovies,
  allTvShows,
  allCartoons,
  allMangas,
  allNovels,
  allComics,
  collectionItems,
  editingItem,
}) {
  const franchiseId = editingItem?.system_id;

  const franchiseEntries = [
    ...(allAnime || [])
      .filter((e) => e.franchise_id === franchiseId)
      .map((e) => ({ ...e, _type: "anime" })),
    ...(allAnimeMovies || [])
      .filter((e) => e.franchise_id === franchiseId)
      .map((e) => ({ ...e, _type: "anime_movie" })),
    ...(allMovies || [])
      .filter((e) => e.franchise_id === franchiseId)
      .map((e) => ({ ...e, _type: "movie" })),
    ...(allTvShows || [])
      .filter((e) => e.franchise_id === franchiseId)
      .map((e) => ({ ...e, _type: "tv-show" })),
    ...(allCartoons || [])
      .filter((e) => e.franchise_id === franchiseId)
      .map((e) => ({ ...e, _type: "cartoon" })),
    ...(allMangas || [])
      .filter((e) => e.franchise_id === franchiseId)
      .map((e) => ({ ...e, _type: "manga" })),
    ...(allNovels || [])
      .filter((e) => e.franchise_id === franchiseId)
      .map((e) => ({ ...e, _type: "novel" })),
    ...(allComics || [])
      .filter((e) => e.franchise_id === franchiseId)
      .map((e) => ({ ...e, _type: "comic" })),
  ].sort((a, b) => getEntryYear(b) - getEntryYear(a));

  const franchiseTypes = parseTypes(ff.franchise_type);

  function entryOptionLabel(e) {
    const name = getDisplayName(e, e._type);
    const yr = releaseYear(
      e.release_date_jp || e.release_date_tw || e.release_date_usa || e.release_date,
    );
    return `${name}${yr ? ` (${yr})` : ""} [${e._type}]`;
  }

  return (
    <>
      <SectionHeader icon="fa-sitemap" title="Titles & Naming" />
      <Field label="Franchise Name EN">
        <input
          className={inputCls}
          value={ff.franchise_name_en}
          onChange={(e) => uf("franchise_name_en", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Franchise Name CN">
          <input
            className={inputCls}
            value={ff.franchise_name_cn}
            onChange={(e) => uf("franchise_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Franchise Name roman">
          <input
            className={inputCls}
            value={ff.franchise_name_roman}
            onChange={(e) => uf("franchise_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Franchise Name JP">
          <input
            className={inputCls}
            value={ff.franchise_name_jp}
            onChange={(e) => uf("franchise_name_jp", e.target.value)}
          />
        </Field>
        <Field label="Franchise Name Alt">
          <input
            className={inputCls}
            value={ff.franchise_name_alt}
            onChange={(e) => uf("franchise_name_alt", e.target.value)}
          />
        </Field>
      </div>
      <SectionHeader icon="fa-info-circle" title="Other Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Collection">
          <ComboBox
            items={collectionItems || []}
            selectedId={ff.collection_id}
            inputText={ff.collection_text}
            onSelect={(id, label) => {
              uf("collection_id", id);
              uf("collection_text", label);
            }}
            onType={(text) => {
              uf("collection_text", text);
              uf("collection_id", null);
            }}
            onClear={() => {
              uf("collection_id", null);
              uf("collection_text", "");
            }}
            placeholder="Search collection (optional)..."
          />
        </Field>
        <Field label="Franchise Type">
          <div className="flex flex-wrap gap-3">
            {FRANCHISE_TYPES.map((v) => {
              const types = parseTypes(ff.franchise_type);
              const checked = types.includes(v);
              return (
                <label
                  key={v}
                  className="flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? types.filter((t) => t !== v)
                        : [...types, v];
                      uf("franchise_type", next.join(", "));
                    }}
                    className="rounded accent-brand"
                  />
                  {v}
                </label>
              );
            })}
          </div>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={ff.my_rating}
            onChange={(e) => uf("my_rating", e.target.value)}
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
            value={ff.franchise_expectation}
            onChange={(e) => uf("franchise_expectation", e.target.value)}
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
      {franchiseTypes.length > 0 && (
        <div className="space-y-3 mt-4">
          {franchiseTypes.map((type) => {
            const currentSlot = (ff.type_slots || {})[type] ?? "";
            return (
              <Field
                key={type}
                label={`Favorite Grid Slot — ${type}`}
                hint="1–9 slot for the favorite franchise 3×3 grid"
              >
                <select
                  className={selectCls}
                  value={currentSlot}
                  onChange={(ev) => {
                    const val = ev.target.value
                      ? parseInt(ev.target.value, 10)
                      : undefined;
                    const next = { ...(ff.type_slots || {}), [type]: val };
                    if (val === undefined) delete next[type];
                    uf(
                      "type_slots",
                      Object.keys(next).length > 0 ? next : null,
                    );
                  }}
                >
                  <option value="">—</option>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            );
          })}
        </div>
      )}
      <SectionHeader icon="fa-image" title="Cover Images" />
      <Field
        label="Main Cover"
        hint="Library page cover — leave blank to auto-pick latest entry with cover"
      >
        <select
          className={selectCls}
          value={ff.cover_entry_id || ""}
          onChange={(e) => uf("cover_entry_id", e.target.value || null)}
        >
          <option value="">— Auto (latest with cover) —</option>
          {franchiseEntries.map((e) => (
            <option key={e.system_id} value={e.system_id}>
              {entryOptionLabel(e)}
            </option>
          ))}
        </select>
      </Field>
      {franchiseTypes.length > 0 && (
        <div className="space-y-3">
          {franchiseTypes.map((type) => {
            const matchingTypes = TYPE_TO_ENTRY_TYPES[type];
            const options = matchingTypes
              ? franchiseEntries.filter((e) => matchingTypes.includes(e._type))
              : franchiseEntries;
            const currentVal = (ff.type_covers || {})[type] || "";
            return (
              <Field
                key={type}
                label={`3x3 Cover — ${type}`}
                hint="3x3 grid cover for this type — leave blank to auto-pick"
              >
                <select
                  className={selectCls}
                  value={currentVal}
                  onChange={(ev) => {
                    const val = ev.target.value || undefined;
                    const next = { ...(ff.type_covers || {}), [type]: val };
                    if (!val) delete next[type];
                    uf(
                      "type_covers",
                      Object.keys(next).length > 0 ? next : null,
                    );
                  }}
                >
                  <option value="">— Auto (latest with cover) —</option>
                  {options.map((e) => (
                    <option key={e.system_id} value={e.system_id}>
                      {entryOptionLabel(e)}
                    </option>
                  ))}
                </select>
              </Field>
            );
          })}
        </div>
      )}
      <Field label="Watch Next Group">
        <select
          className={selectCls}
          value={ff.watch_next_group || ""}
          onChange={(e) => uf("watch_next_group", e.target.value || null)}
        >
          <option value="">— Not in Watch List —</option>
          <option value="12ep">12 EP</option>
          <option value="24ep">24 EP</option>
          <option value="30ep_plus">30+ EP</option>
        </select>
      </Field>
      <Field label="To Rewatch">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!ff.to_rewatch}
            onChange={(e) => uf("to_rewatch", e.target.checked)}
            className="w-4 h-4 rounded accent-brand"
          />
          <span className="text-sm font-medium text-gray-700">
            Mark this franchise for rewatch
          </span>
        </label>
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={ff.remark}
          onChange={(e) => uf("remark", e.target.value)}
        />
      </Field>
    </>
  );
}

