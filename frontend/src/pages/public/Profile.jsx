// Frontend: one person's list, every media type on one page.
//
// The whole point of the media supertable is that this is one query and one
// page rather than nine. Grouping by type is presentation only - the server
// already ordered the rows best-rated first, and each group keeps that order.
//
// A private list answers 404 from the server, so this page never has to decide
// whether it may show something. It only has to say "no profile here" in a way
// that does not distinguish a private list from a username nobody has.
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import {
  Chip,
  Eyebrow,
  RatingStamp,
  Slip,
} from "../../components/ui/primitives";
import { PLAN_TABS } from "../../config/planNextGroups";
import { useApiQuery } from "../../hooks/useApiQuery";
import { entityPath } from "../../lib/entityPath";

// Hyphenated data-layer keys, in the order a page should read them, with the
// labels the Plan page already uses - one spelling of "Anime Movie" per app.
const TYPE_ORDER = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
];

function typeLabel(key) {
  return PLAN_TABS.find((tab) => tab.key === key)?.label ?? key;
}

export default function Profile() {
  const { username } = useParams();
  const { data, isLoading, isError } = useApiQuery(
    ["profile", username],
    endpoints.profile.detail(username),
    { queryOptions: { retry: false } },
  );

  const groups = useMemo(() => {
    if (!data?.entries) return [];
    const byType = new Map();
    for (const entry of data.entries) {
      if (!byType.has(entry.media_type)) byType.set(entry.media_type, []);
      byType.get(entry.media_type).push(entry);
    }
    return TYPE_ORDER.filter((key) => byType.has(key)).map((key) => ({
      key,
      label: typeLabel(key),
      entries: byType.get(key),
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-text-faint">Loading profile...</div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold text-text">No profile here</h1>
        <p className="mt-2 text-text-muted">
          There is no public list for that name. A list is private until its
          owner makes it public.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6 border-b border-border pb-4">
        <Eyebrow>Profile</Eyebrow>
        <h1 className="text-3xl font-bold text-text">{data.username}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.counts.map((row) => (
            <Chip key={row.status}>
              {row.status} {row.count}
            </Chip>
          ))}
          {data.counts.length === 0 && (
            <span className="text-sm text-text-muted">
              Nothing on this list yet.
            </span>
          )}
        </div>
        {data.is_self && !data.list_is_public && (
          <p className="mt-3 text-sm text-text-muted">
            Only you can see this.{" "}
            <Link to="/settings" className="text-brand underline">
              Make it public
            </Link>
            .
          </p>
        )}
      </header>

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.key}>
            {/* Slip renders its own title as an h3, so the group heading is
                written here as an h2 in the same mono caption face - the page
                needs one level of structure above the cards, not two. */}
            <Eyebrow as="h2" className="mb-2">
              {group.label}
            </Eyebrow>
            <Slip>
              <ul className="divide-y divide-border">
                {group.entries.map((entry) => (
                  <li
                    key={entry.media_id}
                    className="flex items-center gap-3 py-2"
                  >
                    <div className="w-10 shrink-0 text-center">
                      {entry.my_rating ? (
                        <RatingStamp rating={entry.my_rating} size="sm" />
                      ) : (
                        <span className="text-text-faint font-mono text-xs">
                          —
                        </span>
                      )}
                    </div>
                    <Link
                      to={entityPath(entry.media_type, entry)}
                      className="flex-1 text-text hover:text-brand"
                    >
                      {entry.display_name}
                    </Link>
                    <span className="font-mono text-xs uppercase text-text-faint">
                      {entry.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Slip>
          </section>
        ))}
      </div>
    </div>
  );
}
