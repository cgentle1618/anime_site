// Frontend: page component file for PersonLibrary.
//
// People are a public entity, not a media type — this sits at /library/person
// as a standalone component, outside LIBRARY_CONFIGS, mirroring
// StudioLibrary.jsx.
//
// The type filter is the same five-type vocabulary the admin sub-tabs use
// (PersonSubTabBar), applied client-side against the `roles` each person
// carries: one /api/person/ request serves every filter, where a per-type
// request would refetch on each click.
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";

import { PERSON_SUB_TABS } from "../../components/forms/PersonSubTabBar";
import { cleanString, getRatingWeight } from "../../utils/media";
import { getCoverUrl, FALLBACK_SVG } from "../../lib/covers";
import { endpoints } from "../../api/endpoints";
import { PERSON_NAME_FIELDS } from "../../lib/naming";
import { Eyebrow } from "../../components/ui/primitives";

export default function PersonLibrary() {
  const [allPeople, setAllPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSort, setCurrentSort] = useState("name");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(endpoints.person.list(), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load data");
        setAllPeople(await res.json());
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

    const result = allPeople.filter((p) => {
      if (typeFilter && !(p.roles || []).some((r) => r.role === typeFilter)) {
        return false;
      }
      if (!qClean) return true;
      // Searches all four name fields, not just the displayed one: someone
      // looking a person up by their Japanese name must find them even when
      // English is the configured display name.
      return PERSON_NAME_FIELDS.some(
        ({ field }) => p[field] && cleanString(p[field]).includes(qClean),
      );
    });

    result.sort((a, b) => {
      if (currentSort === "credit_count") {
        const diff = (b.credit_count ?? 0) - (a.credit_count ?? 0);
        if (diff !== 0) return diff;
      } else if (currentSort === "my_rating") {
        const diff = getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      }
      return (a.display_name || "").localeCompare(b.display_name || "");
    });

    return result;
  }, [allPeople, searchQuery, currentSort, typeFilter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint">Loading people...</p>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <Eyebrow className="mb-1">Library</Eyebrow>
              <h1 className="font-display text-3xl font-semibold text-text leading-none">
                People
              </h1>
              <p className="font-mono text-[11px] text-text-faint mt-1.5">
                {filteredAndSorted.length}{" "}
                {filteredAndSorted.length === 1 ? "person" : "people"}
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <input
                  type="search"
                  placeholder="Search people..."
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
                  <option value="credit_count">Credits</option>
                  <option value="my_rating">My rating</option>
                </select>
              </label>
            </div>
          </div>

          {/* Type filter: the same five types the admin sub-tabs offer. */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTypeFilter("")}
              className={`px-2.5 py-1 border text-xs font-bold transition-colors ${
                typeFilter === ""
                  ? "bg-ink text-ink-text border-ink"
                  : "bg-surface text-text-faint border-border hover:border-border-strong"
              }`}
            >
              All
            </button>
            {PERSON_SUB_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTypeFilter(t.key)}
                className={`px-2.5 py-1 border text-xs font-bold transition-colors ${
                  typeFilter === t.key
                    ? "bg-ink text-ink-text border-ink"
                    : "bg-surface text-text-faint border-border hover:border-border-strong"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border-strong">
            <Eyebrow className="mb-1">Empty</Eyebrow>
            <p className="text-text-muted text-sm">No people found</p>
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
                "Nobody matches this filter yet."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAndSorted.map((person) => (
              <PersonCard key={person.system_id} person={person} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonCard({ person }) {
  const name = person.display_name || "Unknown Person";
  const coverUrl = getCoverUrl(person.photo_file);
  const creditCount = person.credit_count ?? 0;

  return (
    <Link
      to={`/person/${person.system_id}`}
      className="bg-surface border border-border hover:border-border-strong transition-colors flex flex-col cursor-pointer group"
    >
      <div className="flex">
        <div className="w-5 shrink-0 bg-ink text-ink-text flex flex-col items-center py-1.5 overflow-hidden">
          <span
            className="font-mono text-[8px] uppercase tracking-[0.2em] whitespace-nowrap"
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
          {creditCount} credit{creditCount !== 1 ? "s" : ""}
        </span>
      </div>
    </Link>
  );
}
