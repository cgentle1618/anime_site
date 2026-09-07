// Frontend: page component file for CharacterLibrary.
//
// Characters are a public entity, not a media type — this sits at
// /library/character as a standalone component, outside LIBRARY_CONFIGS,
// mirroring PersonLibrary.jsx and StudioLibrary.jsx. Characters carry the
// same four name columns as Person/Studio (and the same display_name_field
// choice), so the name-field list is shared rather than copied.
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";

import { cleanString, getRatingWeight } from "../../utils/media";
import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";
import { endpoints } from "../../api/endpoints";
import { STUDIO_NAME_FIELDS } from "../../lib/naming";
import { Eyebrow } from "../../components/ui/primitives";

export default function CharacterLibrary() {
  const [allCharacters, setAllCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSort, setCurrentSort] = useState("name");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(endpoints.character.list(), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load data");
        setAllCharacters(await res.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredAndSorted = useMemo(() => {
    const qClean = cleanString(searchQuery);

    const result = allCharacters.filter((c) => {
      if (!qClean) return true;
      // Searches all four name fields, not just the displayed one: someone
      // looking a character up by their Japanese name must find them even
      // when English is the configured display name.
      return STUDIO_NAME_FIELDS.some(
        ({ field }) => c[field] && cleanString(c[field]).includes(qClean),
      );
    });

    result.sort((a, b) => {
      if (currentSort === "casting_count") {
        const diff = (b.casting_count ?? 0) - (a.casting_count ?? 0);
        if (diff !== 0) return diff;
      } else if (currentSort === "my_rating") {
        const diff = getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      }
      return (a.display_name || "").localeCompare(b.display_name || "");
    });

    return result;
  }, [allCharacters, searchQuery, currentSort]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint">Loading characters...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center border border-danger bg-danger/10 px-6 py-4 text-danger">
          <p className="font-bold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Filter strip: flat on the canvas */}
      <div className="border-b border-border sticky top-[var(--nav-h)] z-30 bg-canvas">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <Eyebrow className="mb-1">Library</Eyebrow>
              <h1 className="font-display text-3xl font-semibold text-text leading-none">
                Characters
              </h1>
              <p className="font-mono text-[11px] text-text-faint mt-1.5">
                {filteredAndSorted.length}{" "}
                {filteredAndSorted.length === 1 ? "character" : "characters"}
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <input
                  type="search"
                  placeholder="Search characters..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-3 pr-8 py-1.5 bg-surface border border-border-strong text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand transition w-44 sm:w-56"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>

              <label className="flex items-center gap-2">
                <Eyebrow>Sort</Eyebrow>
                <select
                  value={currentSort}
                  onChange={(e) => setCurrentSort(e.target.value)}
                  className="bg-surface border border-border-strong px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand transition"
                >
                  <option value="name">Name</option>
                  <option value="casting_count">Castings</option>
                  <option value="my_rating">My rating</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border-strong">
            <Eyebrow className="mb-1">Empty</Eyebrow>
            <p className="text-text-muted text-sm">No characters found</p>
            <p className="text-sm text-text-faint mt-1">
              {searchQuery ? (
                <>
                  Try a different search or{" "}
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-brand hover:underline"
                  >
                    reset
                  </button>
                </>
              ) : (
                "No characters in the database yet."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAndSorted.map((character) => (
              <CharacterCard key={character.system_id} character={character} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterCard({ character }) {
  const name = character.display_name || "Unknown Character";
  const coverUrl = getCoverUrl(character.photo_file);
  const castingCount = character.casting_count ?? 0;

  return (
    <Link
      to={`/character/${character.system_id}`}
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col cursor-pointer group"
    >
      <div className="flex">
        <div className="w-5 shrink-0 bg-ink text-ink-text flex flex-col items-center py-1.5 overflow-hidden">
          <span
            className="font-mono text-[8px] uppercase tracking-[0.2em] whitespace-nowrap"
            style={{ writingMode: "vertical-rl" }}
          >
            Character
          </span>
        </div>
        <div
          className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
          style={{ aspectRatio: "2/3" }}
        >
          <img
            src={coverUrl}
            alt="Photo"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1 border-t border-border">
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
          title={name}
        >
          {name}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
          {castingCount} casting{castingCount !== 1 ? "s" : ""}
        </span>
      </div>
    </Link>
  );
}
