// Frontend: page component file for Character.
//
// A character is a public entity rather than a media entry, so this page is
// hand-built beside Person.jsx and Studio.jsx instead of coming from one of
// the media detail shapes: the header is a profile, and the body is the
// entries this character is cast in, grouped as GET /api/character/{id}/entries
// returns them — by media type ONLY, because a character holds no roles (a
// person's page groups by media type AND role; see app/routers/character.py's
// get_character_entries). Each entry also names the seiyuu who voiced the
// character in that entry, since (unlike a person's own credits) knowing who
// played the part is the point of looking a character up.
//
// Like Person.jsx it reads the API with plain fetch. The media detail pages go
// through TanStack hooks because their payloads are also written back from
// admin controls; nothing on this page is editable.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";
import { releaseYear } from "../../lib/releaseDate";
import { PERSON_NAME_FIELDS } from "../../lib/naming";
import InfoCard from "../../components/info/InfoCard";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Eyebrow, RatingStamp } from "../../components/ui/primitives";

// The entries endpoint carries only the media_type key, not a display label
// (a character's groups have no role to fold into the label either) — same
// map WatchOrderGuide.jsx keeps locally for the same hyphenated keys.
const TYPE_LABELS = {
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
  comic: "Comic",
};

export default function Character() {
  const { system_id } = useParams();
  const [character, setCharacter] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [characterRes, entriesRes] = await Promise.all([
          fetch(endpoints.character.detail(system_id), {
            credentials: "include",
          }),
          fetch(endpoints.character.entries(system_id), {
            credentials: "include",
          }),
        ]);
        if (!characterRes.ok) throw new Error("Character not found.");
        const characterData = await characterRes.json();
        // The entries call is secondary: a character whose castings fail to
        // load still has a profile worth rendering.
        const entriesData = entriesRes.ok
          ? await entriesRes.json()
          : { groups: [] };
        if (cancelled) return;
        setCharacter(characterData);
        setGroups(entriesData.groups || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [system_id]);

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading character..." />;
  }

  if (error || !character) {
    return (
      <MediaLoadingState
        error={error || "Character not found."}
        errorTitle="Error Loading Character"
      />
    );
  }

  const name = character.display_name || "Unknown Character";
  const photoUrl = getCoverUrl(character.photo_file);
  const otherNames = PERSON_NAME_FIELDS.filter(
    ({ field }) => character[field]?.trim() && character[field].trim() !== name,
  );
  const castingTotal = groups.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/character" className="hover:text-brand transition">
          Characters
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
          {name}
        </span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN: the profile ========== */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex border border-border bg-surface">
            <div className="w-7 shrink-0 bg-ink text-ink-text flex flex-col items-center py-2">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
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
                src={photoUrl}
                alt={`${name} photo`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
              {character.my_rating && (
                <div className="absolute top-2 right-2">
                  <RatingStamp rating={character.my_rating} />
                </div>
              )}
            </div>
          </div>

          {otherNames.length > 0 && (
            <section className="bg-surface border border-border">
              <h3 className="flex items-center gap-3 px-4 py-2.5 border-b border-border font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                Other names
                <span className="flex-1 border-t border-dotted border-border-strong/60" />
              </h3>
              <ul className="p-4 space-y-3" aria-label="Other names">
                {otherNames.map(({ key, label, field }) => (
                  <li key={key} className="min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint mb-1">
                      {label}
                    </div>
                    <div className="text-sm text-text break-words">
                      {character[field]}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ========== RIGHT COLUMN: facts, then the castings ========== */}
        <div className="lg:col-span-3 space-y-6">
          <div>
            <Eyebrow className="mb-1">Character</Eyebrow>
            <h1 className="font-display text-4xl font-semibold text-text leading-tight">
              {name}
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint mt-2">
              {castingTotal} appearance{castingTotal === 1 ? "" : "s"}
            </p>
          </div>

          <InfoCard
            title="Profile"
            fields={[
              { label: "Gender", value: character.gender },
              { label: "Remark", value: character.remark },
            ]}
          />

          {groups.length === 0 ? (
            <section className="border border-dashed border-border-strong px-4 py-10 text-center">
              <Eyebrow className="mb-1">Empty</Eyebrow>
              <p className="text-sm text-text-muted">No appearances</p>
            </section>
          ) : (
            groups.map((group) => (
              <section key={group.media_type}>
                <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {TYPE_LABELS[group.media_type] || group.media_type}
                  <span className="text-text-faint">{group.entries.length}</span>
                  <span className="flex-1 border-t border-dotted border-border-strong/60" />
                </h2>
                {group.entries.length === 0 ? (
                  <p className="text-sm text-text-faint italic">
                    Nothing you can see here.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {group.entries.map((entry) => (
                      <CastingCard
                        key={entry.system_id}
                        entry={entry}
                        navPath={group.nav_path}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// A minimal cover-and-title card, plus the seiyuu who voiced the character in
// this entry. MediaCard is deliberately not reused, same reasoning as
// Person.jsx's CreditCard and Studio.jsx's card: the entries endpoint returns
// a handful of flat keys, not a full media payload.
function CastingCard({ entry, navPath }) {
  const title = entry.display_name || "Untitled";
  const year = releaseYear(entry.release_date);
  const cover = (
    <div
      className="bg-surface-2 overflow-hidden"
      style={{ aspectRatio: "2/3" }}
    >
      <img
        src={getCoverUrl(entry.cover_image_file)}
        alt=""
        className="w-full h-full object-cover"
        onError={(e) => {
          e.target.src = FALLBACK_SVG;
        }}
      />
    </div>
  );
  const facts = (
    <>
      <h3
        className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
        title={title}
      >
        {title}
      </h3>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        {year || "Undated"}
      </span>
    </>
  );

  // The entry cover/title link and the seiyuu link are siblings, never
  // nested: an <a> inside an <a> is invalid HTML and would swallow the
  // seiyuu link's clicks into the entry link's.
  return (
    <div className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col">
      {navPath ? (
        <Link to={`${navPath}/${entry.system_id}`} className="flex flex-col">
          {cover}
          <div className="p-2.5 flex flex-col gap-1 border-t border-border">
            {facts}
          </div>
        </Link>
      ) : (
        <>
          {cover}
          <div className="p-2.5 flex flex-col gap-1 border-t border-border">
            {facts}
          </div>
        </>
      )}
      {entry.seiyuu_display_name && entry.seiyuu_system_id && (
        <Link
          to={`/person/${entry.seiyuu_system_id}`}
          className="px-2.5 pb-2.5 text-xs text-text-muted hover:text-brand transition-colors truncate"
        >
          {entry.seiyuu_display_name}
        </Link>
      )}
    </div>
  );
}
