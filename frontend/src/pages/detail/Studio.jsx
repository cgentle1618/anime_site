// Frontend: page component file for Studio.
//
// A studio is a public entity rather than a media entry, so this page is
// hand-built beside the media detail pages instead of coming from one of
// their shapes: the header is a profile, and the body is the entries the
// studio is credited on, grouped by media type exactly as
// GET /api/studio/{id}/entries returns them.
//
// Like StudioLibrary.jsx it reads the API with plain fetch. The media detail
// pages go through TanStack hooks because their payloads are also written
// back from admin controls; nothing on this page is editable.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";
import { releaseYear } from "../../lib/releaseDate";
import { STUDIO_NAME_FIELDS } from "../../lib/naming";
import InfoCard from "../../components/info/InfoCard";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Eyebrow, RatingStamp } from "../../components/ui/primitives";

// "founded – defunct", or "Since founded" while the studio is still working.
// Both empty means the row is dropped entirely rather than shown as a dash.
function lifespan(studio) {
  const { founded_date: founded, defunct_date: defunct } = studio;
  if (founded && defunct) return `${founded} – ${defunct}`;
  if (founded) return `Since ${founded}`;
  if (defunct) return `Until ${defunct}`;
  return null;
}

export default function Studio() {
  const { system_id } = useParams();
  const [studio, setStudio] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [studioRes, entriesRes] = await Promise.all([
          fetch(endpoints.studio.detail(system_id), { credentials: "include" }),
          fetch(endpoints.studio.entries(system_id), { credentials: "include" }),
        ]);
        if (!studioRes.ok) throw new Error("Studio not found.");
        const studioData = await studioRes.json();
        // The entries call is secondary: a studio whose credits fail to load
        // still has a profile worth rendering.
        const entriesData = entriesRes.ok
          ? await entriesRes.json()
          : { groups: [] };
        if (cancelled) return;
        setStudio(studioData);
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
    return <MediaLoadingState isLoading loadingText="Loading studio..." />;
  }

  if (error || !studio) {
    return (
      <MediaLoadingState
        error={error || "Studio not found."}
        errorTitle="Error Loading Studio"
      />
    );
  }

  const name = studio.display_name || "Unknown Studio";
  const logoUrl = getCoverUrl(studio.logo_file);
  const otherNames = STUDIO_NAME_FIELDS.filter(
    ({ field }) => studio[field]?.trim() && studio[field].trim() !== name,
  );
  const span = lifespan(studio);
  const creditTotal = groups.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb: a catalogue path, set in mono */}
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/studio" className="hover:text-brand transition">
          Studios
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
                Studio
              </span>
            </div>
            <div
              className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
              style={{ aspectRatio: "2/3" }}
            >
              <img
                src={logoUrl}
                alt={`${name} logo`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
              {studio.my_rating && (
                <div className="absolute top-2 right-2">
                  <RatingStamp rating={studio.my_rating} />
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
                      {studio[field]}
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
            <Eyebrow className="mb-1">Studio</Eyebrow>
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
                { label: "Country", value: studio.country },
                { label: "Active", value: span },
              ],
              [
                {
                  label: "Website",
                  value: studio.website_url ? (
                    <a
                      href={studio.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline break-all"
                    >
                      {studio.website_url}
                    </a>
                  ) : null,
                },
                {
                  label: "MAL",
                  value: studio.mal_link ? (
                    <a
                      href={studio.mal_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline break-all"
                    >
                      {studio.mal_id ? `Producer #${studio.mal_id}` : "MyAnimeList"}
                    </a>
                  ) : null,
                },
              ],
              { label: "Remark", value: studio.remark },
            ]}
          />

          {groups.length === 0 ? (
            <section className="border border-dashed border-border-strong px-4 py-10 text-center">
              <Eyebrow className="mb-1">Empty</Eyebrow>
              <p className="text-sm text-text-muted">No credited entries</p>
            </section>
          ) : (
            groups.map((group) => (
              <section key={group.media_type}>
                <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {group.label}
                  <span className="text-text-faint">{group.entries.length}</span>
                  <span className="flex-1 border-t border-dotted border-border-strong/60" />
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {group.entries.map((entry) => (
                    <CreditCard
                      key={entry.system_id}
                      entry={entry}
                      navPath={group.nav_path}
                    />
                  ))}
                </div>
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
// the entries endpoint returns can satisfy.
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

  // Series has no page of its own, so nav_path can legitimately be null;
  // such an entry is shown but not linked.
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
