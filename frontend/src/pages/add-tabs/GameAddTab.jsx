// Frontend: add tab page file for GameAddTab.
//
// The search at the top is not the comic tab's "auto-fill from an existing
// entry": a game is identified against IGDB instead, because the IGDB id it
// stores is Fill's only handle on the game. Everything else still comes from
// the Fill pipeline, and the one field worth copying between entries (the base
// game) has its own picker.
import { useEffect, useRef, useState } from "react";
import ComboBox from "../../components/forms/ComboBox";
import GameCopiesEditor from "../../components/forms/GameCopiesEditor";
import MultiSelect from "../../components/forms/MultiSelect";
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
  COMPLETION_LEVELS,
  GAME_RELEASE_STATUSES,
  GAME_TYPES,
  MY_RATINGS,
  PLAYING_STATUSES,
} from "../../config/fieldOptions";
import StatusOptions from "../../components/ui/StatusOptions";
import { endpoints } from "../../api/endpoints";

export { defaultGame } from "../../config/formFactories";

// The endpoint answers with IGDB's raw game objects, so the three fields the
// dropdown shows are read here rather than on the server.
const IGDB_DEBOUNCE_MS = 350;

/** IGDB's `first_release_date` is Unix seconds UTC; only the year is shown. */
function igdbYear(seconds) {
  if (seconds == null) return null;
  const date = new Date(Number(seconds) * 1000);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

/** IGDB cover URLs are protocol-relative; the thumb size is what search returns. */
function igdbCover(game) {
  const url = game?.cover?.url;
  if (!url) return null;
  return url.startsWith("//") ? `https:${url}` : url;
}

/**
 * Identifies the game against IGDB before it is saved. `onPick` receives the
 * raw IGDB object; turning it into form fields is the page's job, so this
 * widget never touches the form state itself.
 */
export function IgdbSearchBox({ onPick }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  // Debounced: IGDB is rate-limited, so a request goes out only once the
  // typing settles. The cleanup also drops the answer to a stale query.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(endpoints.game.searchIgdb(term, 10), {
          credentials: "include",
        });
        const data = res.ok ? await res.json() : [];
        if (!cancelled) setResults(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, IGDB_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Clicking anywhere else closes the dropdown, as the comic picker does.
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative mb-4">
      <div className="flex items-center gap-2 bg-brand-soft border border-brand/20 rounded-xl px-4 py-2.5">
        <i className="fas fa-magic text-brand text-sm"></i>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search IGDB — type a game name to link and auto-fill..."
          className="flex-1 bg-transparent text-sm font-medium focus:outline-none text-text-muted placeholder-text-faint"
          autoComplete="off"
        />
        {loading && (
          <i className="fas fa-spinner fa-spin text-brand text-xs"></i>
        )}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="text-text-faint hover:text-text-muted"
            aria-label="Clear IGDB search"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {results.map((g) => {
            const cover = igdbCover(g);
            const year = igdbYear(g.first_release_date);
            return (
              <button
                key={g.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(g);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-brand/10 hover:text-brand transition-colors border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  {cover ? (
                    <img
                      src={cover}
                      alt={g.name}
                      className="w-8 h-11 object-cover rounded shrink-0"
                    />
                  ) : (
                    <span className="w-8 h-11 rounded bg-surface-2 shrink-0" />
                  )}
                  <span className="text-sm font-bold text-text">{g.name}</span>
                  {year && (
                    <span className="text-[11px] font-semibold text-text-faint shrink-0">
                      {year}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Every field below the franchise/series pickers, shared verbatim by the
 * Modify tab. `f` is the form state and `u` its updater, so the two pages
 * differ only in which state object they hand in.
 */
export function GameFormBody({ f, u, allGames, excludeGameId, sources }) {
  // ck_games_not_self_parent: a game can never be its own base game, so the
  // row being edited is never offered as a parent.
  const baseGameChoices = excludeGameId
    ? allGames.filter((g) => g.system_id !== excludeGameId)
    : allGames;
  const tagField = (key, source, placeholder) => (
    <MultiSelect
      options={getSourceValues(sources, source)}
      value={f[key]}
      onChange={(v) => u(key, v)}
      placeholder={placeholder}
    />
  );

  const num = (key, label, hint) => (
    <Field label={label} hint={hint}>
      <input
        className={inputCls}
        type="number"
        step="any"
        value={f[key] ?? ""}
        onChange={(e) => u(key, e.target.value)}
        placeholder="0"
      />
    </Field>
  );

  return (
    <>
      <Field label="Game Name CN">
        <input
          className={inputCls}
          value={f.game_name_cn}
          onChange={(e) => u("game_name_cn", e.target.value)}
          placeholder="Chinese title"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Game Name EN">
          <input
            className={inputCls}
            value={f.game_name_en}
            onChange={(e) => u("game_name_en", e.target.value)}
            placeholder="English title"
          />
        </Field>
        <Field label="Game Name Romaji">
          <input
            className={inputCls}
            value={f.game_name_roman}
            onChange={(e) => u("game_name_roman", e.target.value)}
            placeholder="Romanised title"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Game Name JP">
          <input
            className={inputCls}
            value={f.game_name_jp}
            onChange={(e) => u("game_name_jp", e.target.value)}
            placeholder="Japanese title"
          />
        </Field>
        <Field label="Game Name Alt">
          <input
            className={inputCls}
            value={f.game_name_alt}
            onChange={(e) => u("game_name_alt", e.target.value)}
            placeholder="Alternative title"
          />
        </Field>
      </div>

      <SectionHeader icon="fa-sitemap" title="Classification" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Game Type">
          <select
            className={selectCls}
            value={f.game_type}
            onChange={(e) => u("game_type", e.target.value)}
          >
            <option value="">—</option>
            {GAME_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {/* A base game only makes sense for a DLC, expansion or bundle -
            ck_games_base_no_parent rejects one on a Base Game row. */}
        <Field
          label="Base Game"
          hint={
            f.game_type === "Base Game"
              ? "Base games have no parent"
              : "The game this hangs off"
          }
        >
          <ComboBox
            items={baseGameChoices.map((g) => ({
              id: g.system_id,
              label: getDisplayName(g, "game"),
              searchText: [
                g.game_name_cn,
                g.game_name_en,
                g.game_name_roman,
                g.game_name_jp,
                g.game_name_alt,
              ]
                .filter(Boolean)
                .join(" "),
            }))}
            selectedId={f.base_game_id}
            inputText={
              baseGameChoices.find((g) => g.system_id === f.base_game_id)
                ? getDisplayName(
                    baseGameChoices.find(
                      (g) => g.system_id === f.base_game_id,
                    ),
                    "game",
                  )
                : ""
            }
            onSelect={(id) => u("base_game_id", id)}
            onType={() => u("base_game_id", null)}
            onClear={() => u("base_game_id", null)}
            placeholder="Search a base game..."
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Genre">
          {tagField(
            "game_genre",
            { kind: "option", category: "Game Genre", scope: "game" },
            "Select or type genre...",
          )}
        </Field>
        <Field label="Theme">
          {tagField(
            "game_theme",
            { kind: "option", category: "Game Theme", scope: "game" },
            "Select or type theme...",
          )}
        </Field>
        <Field label="Platform" hint="Which platform the game is on">
          {tagField(
            "game_platform",
            { kind: "option", category: "Game Platform", scope: "game" },
            "PlayStation, PC...",
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Mode">
          {tagField(
            "game_mode",
            { kind: "option", category: "Game Mode", scope: "game" },
            "Single player, Co-op...",
          )}
        </Field>
        <Field label="Combat Mode">
          {tagField(
            "combat_mode",
            { kind: "option", category: "Combat Mode", scope: "game" },
            "PvE, PvP...",
          )}
        </Field>
        <Field label="Label">
          {tagField(
            "label",
            { kind: "option", category: "Label", scope: "game" },
            "Select or type label...",
          )}
        </Field>
      </div>

      <SectionHeader icon="fa-chart-bar" title="Status" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Release Status">
          <select
            className={selectCls}
            value={f.release_status}
            onChange={(e) => u("release_status", e.target.value)}
          >
            <option value="">—</option>
            {GAME_RELEASE_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Playing Status">
          <select
            className={selectCls}
            value={f.playing_status}
            onChange={(e) => u("playing_status", e.target.value)}
          >
            <StatusOptions statuses={PLAYING_STATUSES} />
          </select>
        </Field>
        <Field label="My Rating">
          <select
            className={selectCls}
            value={f.my_rating}
            onChange={(e) => u("my_rating", e.target.value)}
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
        <Field label="Completion Level">
          <select
            className={selectCls}
            value={f.completion_level}
            onChange={(e) => u("completion_level", e.target.value)}
          >
            <option value="">—</option>
            {COMPLETION_LEVELS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Current Patch" hint="e.g. 1.6.2">
          <input
            className={inputCls}
            value={f.current_patch}
            onChange={(e) => u("current_patch", e.target.value)}
            placeholder="1.6.2"
          />
        </Field>
      </div>
      {/* Three tristate axes, independent of the ladder above and of each
          other. "All Achievements" is not read from the counts below. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="All Endings" hint="Separate axis from completion level">
          <select
            className={selectCls}
            value={f.all_endings}
            onChange={(e) => u("all_endings", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Field>
        <Field label="All Achievements">
          <select
            className={selectCls}
            value={f.all_achievements}
            onChange={(e) => u("all_achievements", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Field>
        <Field label="All Collected" hint="Every in-game collectible">
          <select
            className={selectCls}
            value={f.all_collected}
            onChange={(e) => u("all_collected", e.target.value)}
          >
            <option value="">—</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Field>
      </div>

      <SectionHeader icon="fa-list-ol" title="Progress" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("hours_played", "Hours Played")}
        {num("achievements_earned", "Achievements Earned")}
        {num("achievements_total", "Achievements Total")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("hltb_main", "HLTB Main", "Hours, filled from IGDB")}
        {num("hltb_main_extra", "HLTB Main + Extra", "Hours")}
        {num("hltb_completionist", "HLTB Completionist", "Hours")}
      </div>

      <SectionHeader icon="fa-pen-nib" title="Credits" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Developer" hint="A studio row, quick-created if new">
          {tagField("studio", { kind: "studio" }, "Select or type developer...")}
        </Field>
        <Field label="Publisher" hint="A publisher row, quick-created if new">
          {tagField(
            "publisher",
            { kind: "publisher" },
            "Select or type publisher...",
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Director">
          {tagField(
            "director",
            { kind: "person", role: "director", scope: "game" },
            "Select or type director...",
          )}
        </Field>
        <Field label="Composer">
          {tagField(
            "composer",
            { kind: "person", role: "composer", scope: "game" },
            "Select or type composer...",
          )}
        </Field>
      </div>

      <SectionHeader icon="fa-calendar" title="Release & Prices" />
      <ReleaseDateInput
        label="Release Date"
        value={f.release_date}
        onChange={(v) => u("release_date", v)}
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("price_original_us", "MSRP (US)")}
        {num("price_original_jp", "MSRP (JP)")}
        {num("price_original_tw", "MSRP (TW)")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {num("price_current_us", "Current Price (US)")}
        {num("price_current_jp", "Current Price (JP)")}
        {num("price_current_tw", "Current Price (TW)")}
      </div>

      <SectionHeader icon="fa-box-open" title="Copies" />
      <Field
        label="Copies"
        hint="One row per copy owned or wanted — Ownership on the entry is derived from these"
      >
        <GameCopiesEditor
          items={f.copies}
          onChange={(v) => u("copies", v)}
        />
      </Field>

      <SectionHeader icon="fa-external-link-alt" title="Sources" />
      <Field
        label="IGDB Link"
        hint="Fill Game pulls genres, themes, companies, time-to-beat and the parent game from it"
      >
        <input
          className={inputCls}
          value={f.igdb_link}
          onChange={(e) => u("igdb_link", e.target.value)}
          placeholder="https://www.igdb.com/games/elden-ring"
        />
      </Field>
      <Field label="Steam Link" hint="Reserved for the Steam sync">
        <input
          className={inputCls}
          value={f.steam_link}
          onChange={(e) => u("steam_link", e.target.value)}
          placeholder="https://store.steampowered.com/app/1245620/"
        />
      </Field>
      {/* No access group: where a game can be played is the Platform tag,
          and which copy was bought is the Copies editor. */}
      <SourcesEditor
        value={f.sources}
        onChange={(rows) => u("sources", rows)}
        mediaType="game"
        sources={sources}
        showAccess={false}
      />

      <SectionHeader icon="fa-flag" title="Flags" />
      <div className="flex flex-wrap gap-6 mt-2">
        <Field label="Play Next">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!f.play_next}
              onChange={(e) => u("play_next", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
              Add to Play Next list
            </span>
          </label>
        </Field>
        <Field label="To Replay">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!f.to_replay}
              onChange={(e) => u("to_replay", e.target.checked)}
              className="w-4 h-4 rounded accent-brand"
            />
            <span className="text-sm font-medium text-text-muted">
              Mark for replay
            </span>
          </label>
        </Field>
      </div>

      <SectionHeader icon="fa-sticky-note" title="Notes & Other" />
      <Field label="Cover Image File" hint="e.g. game/5114.jpg">
        <input
          className={inputCls}
          value={f.cover_image_file}
          onChange={(e) => u("cover_image_file", e.target.value)}
          placeholder="game/5114.jpg"
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={f.remark}
          onChange={(e) => u("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </>
  );
}

/** The franchise and series pickers, shared by both game tabs. */
export function GameLineageFields({
  f,
  u,
  allFranchises,
  seriesItemsForGame,
  franchiseCollections,
}) {
  return (
    <>
      <Field label="Franchise">
        <ComboBox
          items={allFranchises
            .filter(
              (fr) =>
                parseTypes(fr.franchise_type).includes("Game") ||
                !fr.franchise_type,
            )
            .map((fr) => ({
              id: fr.system_id,
              label: getDisplayName(fr, "franchise"),
              searchText: [
                fr.franchise_name_en,
                fr.franchise_name_cn,
                fr.franchise_name_roman,
                fr.franchise_name_jp,
                fr.franchise_name_alt,
              ]
                .filter(Boolean)
                .join(" "),
            }))}
          selectedId={f.franchise_id}
          inputText={f.franchise_text}
          onSelect={(id, label) => {
            u("franchise_id", id);
            u("franchise_text", label);
            u("series_id", null);
            u("series_text", "");
          }}
          onType={(text) => {
            u("franchise_text", text);
            u("franchise_id", null);
            u("series_id", null);
            u("series_text", "");
          }}
          onClear={() => {
            u("franchise_id", null);
            u("franchise_text", "");
            u("series_id", null);
            u("series_text", "");
          }}
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={f.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series">
        <ComboBox
          items={seriesItemsForGame}
          selectedId={f.series_id}
          inputText={f.series_text}
          onSelect={(id, label) => {
            u("series_id", id);
            u("series_text", label);
          }}
          onType={(text) => {
            u("series_text", text);
            u("series_id", null);
          }}
          onClear={() => {
            u("series_id", null);
            u("series_text", "");
          }}
          placeholder="Search or type new series..."
          allowNew
        />
      </Field>
    </>
  );
}

export default function GameAddTab({
  franchiseCollections,
  gmf,
  ugm,
  allFranchises,
  allGames,
  seriesItemsForGame,
  sources,
  applyGameAutofill,
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-2">
      {/* IGDB search */}
      <IgdbSearchBox onPick={applyGameAutofill} />
      <SectionHeader icon="fa-gamepad" title="Titles & Naming" />
      <GameLineageFields
        f={gmf}
        u={ugm}
        allFranchises={allFranchises}
        seriesItemsForGame={seriesItemsForGame}
        franchiseCollections={franchiseCollections}
      />
      <GameFormBody f={gmf} u={ugm} allGames={allGames} sources={sources} />
    </div>
  );
}
