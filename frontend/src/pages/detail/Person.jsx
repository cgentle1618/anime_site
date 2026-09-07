// Frontend: page component file for Person.
//
// A person is a public entity rather than a media entry, so this page is
// hand-built beside the media detail pages instead of coming from one of
// their shapes: the header is a profile, and the body is the entries the
// person is credited on, grouped as GET /api/person/{id}/entries returns them
// — by media type AND role, because one person can be an anime's director and
// a manga's author, and each group carries the label that credit has on that
// media type.
//
// Like Studio.jsx it reads the API with plain fetch. The media detail pages go
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

export default function Person() {
  const { system_id } = useParams();
  const [person, setPerson] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [personRes, entriesRes] = await Promise.all([
          fetch(endpoints.person.detail(system_id), { credentials: "include" }),
          fetch(endpoints.person.entries(system_id), {
            credentials: "include",
          }),
        ]);
        if (!personRes.ok) throw new Error("Person not found.");
        const personData = await personRes.json();
        // The entries call is secondary: a person whose credits fail to load
        // still has a profile worth rendering.
        const entriesData = entriesRes.ok
          ? await entriesRes.json()
          : { groups: [] };
        if (cancelled) return;
        setPerson(personData);
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
    return <MediaLoadingState isLoading loadingText="Loading person..." />;
  }

  if (error || !person) {
    return (
      <MediaLoadingState
        error={error || "Person not found."}
        errorTitle="Error Loading Person"
      />
    );
  }

  const name = person.display_name || "Unknown Person";
  const photoUrl = getCoverUrl(person.photo_file);
  const otherNames = PERSON_NAME_FIELDS.filter(
    ({ field }) => person[field]?.trim() && person[field].trim() !== name,
  );
  const creditTotal = groups.reduce((sum, g) => sum + g.entries.length, 0);
  // The types they are offered under, deduplicated: person_role carries one
  // row per (role, scope) and the label here is the type, not the scope.
  const types = [...new Set((person.roles || []).map((r) => r.role))];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/person" className="hover:text-brand transition">
          People
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
                Person
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
              {person.my_rating && (
                <div className="absolute top-2 right-2">
                  <RatingStamp rating={person.my_rating} />
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
                      {person[field]}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ========== RIGHT COLUMN: facts, then the credits ========== */}
        <div className="lg:col-span-3 space-y-6">
          <div>
            <Eyebrow className="mb-1">Person</Eyebrow>
            <h1 className="font-display text-4xl font-semibold text-text leading-tight">
              {name}
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint mt-2">
              {creditTotal} credited entr{creditTotal === 1 ? "y" : "ies"}
            </p>
          </div>

          <InfoCard
            title="Profile"
            fields={[
              [
                { label: "Gender", value: person.gender },
                { label: "Types", value: types.join(", ") || null },
              ],
              { label: "Remark", value: person.remark },
            ]}
          />

          {groups.length === 0 ? (
            <section className="border border-dashed border-border-strong px-4 py-10 text-center">
              <Eyebrow className="mb-1">Empty</Eyebrow>
              <p className="text-sm text-text-muted">No credited entries</p>
            </section>
          ) : (
            groups.map((group) => (
              <section key={`${group.media_type}:${group.role}`}>
                <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {group.label}
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
                      <CreditCard
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

// A minimal cover-and-title card. MediaCard is deliberately not reused: it
// reads a full media payload (status fields, franchise dict, admin toggles)
// and resolves its title through getDisplayName, none of which the four keys
// the entries endpoint returns can satisfy. Same reasoning, same shape as
// Studio.jsx's card.
function CreditCard({ entry, navPath }) {
  const title = entry.display_name || "Untitled";
  const year = releaseYear(entry.release_date);
  const card = (
    <>
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
      <div className="p-2.5 flex flex-col gap-1 border-t border-border">
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
          title={title}
        >
          {title}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
          {year || "Undated"}
        </span>
      </div>
    </>
  );

  if (!navPath) {
    return <div className="bg-surface border border-border">{card}</div>;
  }
  return (
    <Link
      to={`${navPath}/${entry.system_id}`}
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col"
    >
      {card}
    </Link>
  );
}
