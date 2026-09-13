// Frontend: what the PUBLIC lists say about one entry.
//
// Public lists only, which on a small site means small numbers. That is the
// honest answer: counting private lists would let anyone read one by watching
// the total move. The sample size is always printed beside the average for the
// same reason - an average over two ratings is not the same claim as an
// average over two hundred, and a bare letter hides the difference.
//
// Renders nothing at all when no public list holds the entry. An empty
// "Community" slip is a frame around nothing.
import { endpoints } from "../../api/endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Eyebrow, RatingStamp, Slip } from "../ui/primitives";

export default function CommunityCard({ mediaId }) {
  const { data } = useApiQuery(
    ["community", mediaId],
    endpoints.community.forEntry(mediaId),
    { enabled: Boolean(mediaId), queryOptions: { retry: false } },
  );

  // Shape, not just presence. This card hangs off nine detail pages, and one
  // that threw on an unexpected payload would take the whole page down with
  // it - so anything that is not recognisably an aggregate renders nothing.
  if (!data || !Array.isArray(data.statuses) || !data.list_count) return null;

  return (
    <Slip title="Community">
      {data.average_rating && (
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
          <RatingStamp rating={data.average_rating} size="md" />
          <div>
            <Eyebrow>Average</Eyebrow>
            <div className="font-mono text-xs text-text-faint">
              {data.sample_size} ratings
            </div>
          </div>
        </div>
      )}

      <ul className="space-y-1">
        {data.statuses.map((row) => (
          <li key={row.status} className="flex items-baseline justify-between">
            <span className="text-sm text-text-muted">{row.status}</span>
            <span className="font-mono text-sm text-text">{row.count}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-text-faint">
        Public lists only
      </p>
    </Slip>
  );
}
