// Frontend: read-only inventory of what the outside world writes into the
// database.
//
// The question it answers is the one a Fill or Replace run raises and no
// other page will tell you: I pointed a pipeline at Tenrai, so what did it
// just change? Two answers, and the page is shaped around keeping them apart:
//
//   * Per field - fill-only or overwrite. Nearly everything is fill-only,
//     written once into an empty column and never touched again. Exactly
//     three columns are rewritten on every run, and those three are the
//     entire behavioural difference a Replace makes.
//   * Per media type - which pipelines exist at all. Comic, Game and Studio
//     have no bulk Replace; Comic sits out of Fill All to protect its quota.
//
// The trap this page is built to avoid: Replace does NOT write a different
// set of fields from Fill. It calls the same autofill function with the same
// arguments, and differs only in which entries it selects. A two-column
// "Fill / Replace" table would print every value twice and quietly teach the
// wrong model, so the overwrite list is stated once, up front, instead.
//
// Read-only, and not merely unimplemented: every rule shown is a property of
// the code in app/services/domain/autofill.py. There is nothing here an admin
// could edit that would change what a Fill run does. The catalog is served by
// GET /api/constants/external-apis from app/services/integrations/catalog.py;
// the prose version, with the mapping rules this page omits, is
// docs/external-apis.md.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Chip, Eyebrow, Slip } from "../../components/ui/primitives";
import { endpoints } from "../../api/endpoints";
import { scopeChip } from "../../config/scopeColors";

// Only "overwrite" changes something that is already there. Everything else
// is a flavour of "written once, into an empty slot" - worth distinguishing
// in the note column, not worth a second colour. Design rule 1: brand is the
// page's one accent, and it is spent here.
const RULE_TONE = { overwrite: "brand" };

// Studio is not a media entry, so it has no scope hue. Its key still reads
// fine as a plain chip.
const SCOPED_KEYS = new Set([
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
]);

function mediaId(key) {
  return `api-${key}`;
}

// The pipeline chips, read off the flags the endpoint derives from the spec.
// Stated in the affirmative where a pipeline exists and the negative where it
// does not, because "no bulk Replace" is the surprising half.
function pipelineChips(media) {
  const chips = [];
  chips.push(media.in_fill_all ? "in Fill All" : "not in Fill All");
  if (media.fill_only) {
    chips.push("fill only — no Replace at all");
  } else {
    chips.push(media.has_bulk_replace ? "bulk Replace" : "no bulk Replace");
  }
  if (media.budget_limited) chips.push("stops on quota");
  return chips;
}

function WriteRow({ mediaKey, write }) {
  const tone = RULE_TONE[write.rule] || "muted";
  return (
    <tr
      data-testid={`write-${mediaKey}-${write.field}`}
      className="border-b border-border last:border-0 align-baseline"
    >
      <td className="px-3 py-2 font-mono text-xs text-text whitespace-nowrap">
        {write.field}
      </td>
      <td className="px-3 py-2">
        <Chip tone={tone}>{write.rule}</Chip>
      </td>
      <td className="px-3 py-2">
        <Eyebrow className="text-text-faint">{write.target}</Eyebrow>
      </td>
      <td className="px-3 py-2 text-xs text-text-muted">{write.note || "—"}</td>
    </tr>
  );
}

function SourceTable({ mediaKey, block }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="flex items-baseline gap-3 mb-2">
        <Eyebrow as="h4" className="text-text-muted">
          {block.label}
        </Eyebrow>
        <span className="flex-1 border-t border-dotted border-border-strong/60" />
      </div>
      {/* Wide tables scroll inside their own box; the page never scrolls
          sideways. */}
      <div className="overflow-x-auto border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th className="px-3 py-2">
                <Eyebrow>Field</Eyebrow>
              </th>
              <th className="px-3 py-2">
                <Eyebrow>Rule</Eyebrow>
              </th>
              <th className="px-3 py-2">
                <Eyebrow>Lands in</Eyebrow>
              </th>
              <th className="px-3 py-2">
                <Eyebrow>Note</Eyebrow>
              </th>
            </tr>
          </thead>
          <tbody>
            {block.writes.map((write) => (
              <WriteRow
                key={`${block.source}-${write.field}`}
                mediaKey={mediaKey}
                write={write}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MediaSection({ media, combinations }) {
  const combination =
    media.sources.length > 1
      ? combinations.find((c) => c.key === media.combination)?.description
      : null;

  return (
    <section
      id={mediaId(media.key)}
      data-testid={`media-${media.key}`}
      className="mb-8 scroll-mt-28"
    >
      <Slip
        title={media.label}
        actions={
          SCOPED_KEYS.has(media.key) ? (
            <span className={scopeChip(media.key)}>{media.key}</span>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
          <Eyebrow>
            keyed on <span className="text-text-muted">{media.keyed_by}</span>
          </Eyebrow>
          <Eyebrow>
            {media.requests_per_entry}{" "}
            {media.requests_per_entry === "1" ? "request" : "requests"} per entry
          </Eyebrow>
          {pipelineChips(media).map((label) => (
            <Chip key={label} tone="muted">
              {label}
            </Chip>
          ))}
        </div>

        {(combination || media.note) && (
          <p className="text-xs text-text-muted mb-3 max-w-3xl">
            {combination && (
              <span className="font-bold text-text">{combination} </span>
            )}
            {media.note}
          </p>
        )}

        {media.sources.map((block) => (
          <SourceTable key={block.source} mediaKey={media.key} block={block} />
        ))}
      </Slip>
    </section>
  );
}

export default function ExternalApis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(endpoints.constants.externalApis(), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  // Every field anywhere in the catalog that a run rewrites. Computed rather
  // than declared so it cannot fall out of step with the tables below - this
  // summary IS the page's answer, and a stale one would be worse than none.
  const overwritten = useMemo(() => {
    if (!data) return [];
    const seen = new Map();
    for (const media of data.media) {
      for (const block of media.sources) {
        for (const write of block.writes) {
          if (write.rule !== "overwrite") continue;
          if (!seen.has(write.field)) seen.set(write.field, new Set());
          seen.get(write.field).add(block.label);
        }
      }
    }
    return [...seen.entries()].map(([field, sources]) => ({
      field,
      sources: [...sources],
    }));
  }, [data]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-black text-text">
          External APIs
        </h1>
        <p className="text-sm text-text-faint mt-1">
          Which outside service writes which field, and whether it fills the
          field or replaces it.
        </p>
      </header>

      <Slip title="What a run changes" className="mb-8">
        <div className="space-y-3 text-sm text-text-muted max-w-3xl">
          <p>
            Replace does not write a different set of fields from Fill. It calls
            the same code with the same arguments; the two differ only in which
            entries they pick — Fill takes entries with something missing,
            Replace takes every entry that carries an external id. So the rule
            below is per field, and it is the same rule under both pipelines.
          </p>
          <p>
            Almost everything is{" "}
            <span className="font-bold text-text">fill-only</span>: written once
            into an empty column, and never touched again. Anything you have
            typed by hand is safe from every pipeline on this page. These are
            the only fields a run rewrites:
          </p>
          <ul data-testid="overwrite-summary" className="space-y-1">
            {overwritten.map((row) => (
              <li key={row.field} className="flex flex-wrap items-baseline gap-2">
                <Chip tone="brand">overwrite</Chip>
                <span className="font-mono text-xs text-text">{row.field}</span>
                <Eyebrow>from {row.sources.join(", ")}</Eyebrow>
              </li>
            ))}
          </ul>
          <p>
            Read-only. Every rule here is a property of the autofill code, not a
            setting — there is nothing on this page to change. The vocabulary
            those values are matched against lives on{" "}
            <Link
              to="/options"
              className="font-bold text-brand hover:text-brand-hover"
            >
              System Options
            </Link>
            , and what each API&rsquo;s English becomes on{" "}
            <Link
              to="/aliases"
              className="font-bold text-brand hover:text-brand-hover"
            >
              Alias Conversion
            </Link>
            . The pipelines themselves are run from the{" "}
            <Link
              to="/system"
              className="font-bold text-brand hover:text-brand-hover"
            >
              Control Center
            </Link>
            .
          </p>
        </div>
      </Slip>

      {loading && (
        <p className="text-sm text-text-faint py-12 text-center">Loading...</p>
      )}

      {!loading && !data && (
        <p data-testid="external-apis-empty" className="text-sm text-text-faint">
          The catalog could not be loaded. This page is admin-only — if you are
          signed in as an admin, the request failed rather than being refused.
        </p>
      )}

      {!loading && data && (
        <>
          {data.media.map((media) => (
            <MediaSection
              key={media.key}
              media={media}
              combinations={data.combinations}
            />
          ))}

          <Slip title="The services" padded={false} className="mb-8">
            <div className="overflow-x-auto">
              <table data-testid="service-table" className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left">
                    <th className="px-3 py-2">
                      <Eyebrow>Service</Eyebrow>
                    </th>
                    <th className="px-3 py-2">
                      <Eyebrow>Feeds</Eyebrow>
                    </th>
                    <th className="px-3 py-2">
                      <Eyebrow>Key</Eyebrow>
                    </th>
                    <th className="px-3 py-2">
                      <Eyebrow>Rate limit</Eyebrow>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((service) => (
                    <tr
                      key={service.key}
                      className="border-b border-border last:border-0 align-baseline"
                    >
                      <td className="px-3 py-2">
                        <div className="font-bold text-text">
                          {service.label}
                        </div>
                        <div className="font-mono text-[10px] text-text-faint break-all">
                          {service.base_url}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {service.feeds.map((key) => (
                            <a key={key} href={`#${mediaId(key)}`}>
                              <Chip tone="ink">{key}</Chip>
                            </a>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-text-muted">
                        {service.auth}
                      </td>
                      <td className="px-3 py-2 text-xs text-text-muted">
                        {service.rate_limit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-3 py-3 text-xs text-text-muted border-t border-border">
              {data.key_missing_behaviour}
            </p>
          </Slip>

          <Slip title="Reading the rules">
            <dl className="space-y-2 text-sm max-w-3xl">
              {data.rules.map((rule) => (
                <div key={rule.key} className="flex flex-wrap gap-2 items-baseline">
                  <dt>
                    <Chip tone={RULE_TONE[rule.key] || "muted"}>{rule.key}</Chip>
                  </dt>
                  <dd className="text-xs text-text-muted flex-1 min-w-[16rem]">
                    {rule.description}
                  </dd>
                </div>
              ))}
            </dl>
          </Slip>
        </>
      )}
    </div>
  );
}
