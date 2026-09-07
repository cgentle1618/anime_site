// Frontend: read-only view of every external-source name the app resolves.
//
// /options answers "what values does this category offer?". This page answers
// the question Fill actually asks, which is the inverse: IGDB has just said
// "Role-playing (RPG)" — what does that become, and what happens if nothing
// matches? Both are views over the same system_option rows; only the direction
// of the lookup differs, which is why the alias rows are inverted in
// lib/aliasGroups.js rather than read straight off the options list.
//
// Read-only on purpose, like /options: aliases are edited on the admin
// Add / Modify pages under System → Alias, and every section says so. The one
// thing this page has that no form does is the gap column — the values sitting
// in an aliased category that no external string can reach.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { scopeChip } from "../../config/scopeColors";
import { groupAliasesBySource } from "../../lib/aliasGroups";

// Anchor id for a source's section. Sources are short lowercase keys, but the
// id is derived rather than used raw so a future "comic vine" cannot produce a
// fragment with a space in it.
function sourceId(source) {
  return `alias-${source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

// The /options anchor for a category, so a row can jump to the value's home.
// Must stay in step with categoryId() in SystemOptions.jsx.
function optionsAnchor(category) {
  return `/options#opt-${category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function CategoryTable({ category, rows, unaliased }) {
  return (
    <div className="mb-8 last:mb-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h3 className="text-sm font-black text-text">{category}</h3>
        <span className="font-mono text-[10px] text-text-faint uppercase tracking-widest">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
        <Link
          to={optionsAnchor(category)}
          className="text-[11px] font-bold text-brand hover:text-brand-hover"
        >
          See the full vocabulary →
        </Link>
      </div>

      {/* Wide tables scroll inside their own box; the page never scrolls
          sideways. */}
      <div className="overflow-x-auto border border-border rounded-xl bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="text-left px-3 py-2 text-[10px] font-black text-text-faint uppercase tracking-widest">
                What the API says
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-black text-text-faint uppercase tracking-widest">
                What it becomes
              </th>
              <th className="text-left px-3 py-2 text-[10px] font-black text-text-faint uppercase tracking-widest">
                Scopes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.external}→${row.value}`}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-2 font-mono text-xs text-text-muted">
                  {row.external}
                </td>
                <td className="px-3 py-2 font-bold text-text">{row.value}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {row.scopes.length === 0 ? (
                      <span className="text-[10px] text-text-faint">
                        everywhere
                      </span>
                    ) : (
                      row.scopes.map((s) => (
                        <span key={s} className={scopeChip(s)}>
                          {s}
                        </span>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unaliased.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          <span className="font-bold text-text">
            Nothing maps to {unaliased.length}{" "}
            {unaliased.length === 1 ? "value" : "values"} here:
          </span>{" "}
          {unaliased.join("、")}. These can only be set by hand — a Fill run
          will never produce them.
        </p>
      )}
    </div>
  );
}

export default function Aliases() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // limit=5000 is the endpoint's ceiling. The default 1000 would silently
    // truncate an inventory page, which is the one place that must be whole.
    fetch(buildUrl(endpoints.options.list(), { limit: 5000 }), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, []);

  const sources = useMemo(() => groupAliasesBySource(options), [options]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-text flex items-center gap-3">
          <i className="fas fa-right-left text-brand"></i> Alias Conversion
        </h1>
        <p className="text-sm text-text-faint mt-1">
          What each external API calls a vocabulary value, and what it is stored
          as.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-sm p-5 mb-8 space-y-2 text-sm text-text-muted">
        <p>
          External APIs speak English; the vocabulary is Chinese. A Fill run
          resolves the API&rsquo;s string through the rows below before storing
          anything — and a term with{" "}
          <span className="font-bold text-text">no row is logged and
          skipped</span>, never stored raw and never guessed at. That is the
          gap this page is for.
        </p>
        <p>
          Read-only. Aliases are edited on{" "}
          <Link
            to="/modify"
            className="font-bold text-brand hover:text-brand-hover"
          >
            Modify
          </Link>{" "}
          under System → Alias, or on the System Option form itself. The rest of
          the vocabulary lives on{" "}
          <Link
            to="/options"
            className="font-bold text-brand hover:text-brand-hover"
          >
            System Options
          </Link>
          .
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
            <p className="text-text-faint font-medium">Loading...</p>
          </div>
        </div>
      )}

      {!loading && sources.length === 0 && (
        <p className="text-sm text-text-faint">
          No alias rows yet. Nothing in the vocabulary can be filled from an
          external API.
        </p>
      )}

      {!loading &&
        sources.map((source) => (
          <section
            key={source.source}
            id={sourceId(source.source)}
            className="mb-10 scroll-mt-28"
          >
            <div className="flex flex-wrap items-baseline gap-3 mb-4 pb-2 border-b-2 border-border">
              <h2 className="text-lg font-black text-text uppercase tracking-wide">
                {source.source}
              </h2>
              <span className="font-mono text-[10px] text-text-faint uppercase tracking-widest">
                {source.total} alias {source.total === 1 ? "row" : "rows"} in{" "}
                {source.categories.length}{" "}
                {source.categories.length === 1 ? "category" : "categories"}
              </span>
            </div>
            {source.categories.map((c) => (
              <CategoryTable key={c.category} {...c} />
            ))}
          </section>
        ))}
    </div>
  );
}
