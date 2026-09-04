// Frontend: page component file for Studio.
//
// A studio is a public entity, not a media type - it sits at /studio/:id
// mirroring the Franchise hub's shape (profile header + grouped member
// entries) without the hub's tabs, admin editing or plan-next wiring, none
// of which a studio has.
//
// Credited entries arrive pre-shaped and pre-filtered by the API
// ({system_id, display_name, cover_image_file, release_date} per entry) -
// there is no raw media row here with the type-specific fields MediaCard
// expects (anime_name_cn, ep_fin, watching_status, ...), so entries are
// rendered with a small dedicated card instead of forcing that shape.
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";
import { STUDIO_NAME_FIELDS } from "../../lib/naming";
import { HubLoading, HubError } from "../../components/hub/HubStates";
import {
  HubShell,
  GRID_CLS,
  Crumbs,
  HeroCover,
  Field,
  Section,
} from "../../components/hub/HubChrome";

function EntryCard({ entry, navPath }) {
  const coverUrl = getCoverUrl(entry.cover_image_file);
  return (
    <Link
      to={`${navPath}/${entry.system_id}`}
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col cursor-pointer"
    >
      <div className="relative aspect-[2/3] bg-surface-2 overflow-hidden">
        <img
          src={coverUrl}
          alt={entry.display_name}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>
      <div className="p-2.5 flex flex-col gap-1 flex-1 border-t border-border">
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
          title={entry.display_name}
        >
          {entry.display_name}
        </h3>
        {entry.release_date && (
          <span className="font-mono text-[10px] text-text-faint">
            {entry.release_date}
          </span>
        )}
      </div>
    </Link>
  );
}

/** `founded – defunct`, `Since founded` when active, or null when both are empty. */
function activeRangeText(studio) {
  const { founded_date: founded, defunct_date: defunct } = studio;
  if (founded && defunct) return `${founded} – ${defunct}`;
  if (founded) return `Since ${founded}`;
  if (defunct) return defunct;
  return null;
}

export default function Studio() {
  const { system_id } = useParams();
  const [studio, setStudio] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    async function load() {
      try {
        const [sRes, eRes] = await Promise.all([
          fetch(endpoints.studio.detail(system_id), { credentials: "include" }),
          fetch(endpoints.studio.entries(system_id), { credentials: "include" }),
        ]);
        if (sRes.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!sRes.ok) throw new Error("Failed to load studio");
        if (!eRes.ok) throw new Error("Failed to load credited entries");
        const [s, e] = await Promise.all([sRes.json(), eRes.json()]);
        if (cancelled) return;
        setStudio(s);
        setGroups(e.groups || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [system_id]);

  if (loading) return <HubLoading label="Loading studio..." />;

  if (notFound)
    return (
      <HubError
        title="Studio not found"
        backTo="/library/studio"
        backLabel="Studio Library"
      />
    );

  if (error)
    return (
      <HubError
        title="Error loading studio"
        message={error}
        backTo="/library/studio"
        backLabel="Studio Library"
      />
    );

  const otherNames = STUDIO_NAME_FIELDS.filter(({ field }) => {
    const value = studio[field]?.trim();
    return value && value !== studio.display_name;
  });

  const activeText = activeRangeText(studio);

  return (
    <HubShell>
      <Crumbs
        trail={[{ to: "/library/studio", label: "Studios" }]}
        current={studio.display_name}
      />

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        <HeroCover
          src={getCoverUrl(studio.logo_file)}
          spine="Studio"
          id={studio.system_id}
          rating={studio.my_rating}
        />

        <div className="space-y-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-text leading-tight">
              {studio.display_name}
            </h1>
            {otherNames.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {otherNames.map(({ key, label, field }) => (
                  <span key={key} className="text-sm text-text-muted">
                    <span className="text-text-faint">{label}:</span>{" "}
                    {studio[field]}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {studio.my_rating && <Field label="Rating">{studio.my_rating}</Field>}
            {studio.country && <Field label="Country">{studio.country}</Field>}
            {activeText && <Field label="Active">{activeText}</Field>}
            {studio.website_url && (
              <Field label="Website">
                <a
                  href={studio.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline break-all"
                >
                  {studio.website_url}
                </a>
              </Field>
            )}
            {studio.mal_link && (
              <Field label="MAL">
                <a
                  href={studio.mal_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline"
                >
                  MyAnimeList
                </a>
              </Field>
            )}
          </div>

          {studio.remark && (
            <Field label="Remark">
              <p className="text-sm text-text-muted whitespace-pre-wrap">
                {studio.remark}
              </p>
            </Field>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border-strong">
          <p className="text-text-muted text-sm">No credited entries</p>
        </div>
      ) : (
        groups.map((group) => (
          <Section
            key={group.media_type}
            title={group.label}
            count={group.entries.length}
          >
            <div className={GRID_CLS}>
              {group.entries.map((entry) => (
                <EntryCard
                  key={entry.system_id}
                  entry={entry}
                  navPath={group.nav_path}
                />
              ))}
            </div>
          </Section>
        ))
      )}
    </HubShell>
  );
}
