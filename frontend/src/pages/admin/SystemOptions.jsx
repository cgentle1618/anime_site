// Frontend: read-only inventory of every choice list in the app, grouped by
// the three tiers docs/options.md defines.
//
// The tiers answer one question - "does code branch on the exact value?" -
// and they have three different homes, which is exactly why an admin needs a
// single place to see them side by side:
//
//   Tier 1  closed enums in app/utils/constants.py, served by /api/constants
//   Tier 2  open vocabularies in system_option, served by /api/options
//   Tier 3  entities in person / studio, credited via media_credit
//
// This page never writes. Tier 1 is not editable at all (renaming a value
// there breaks business logic silently); Tier 2 is edited in the Options tab
// of Add/Modify; Tier 3 records are managed on the person/studio forms. Each
// section says so and links where the editing actually happens.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { buildUrl } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useConstants } from "../../config/useConstants";

// Tier 3 is the one section with no endpoint that describes itself, because
// the interesting fact is historical: which old system_options category each
// entity role replaced. Mirrors the "Became Entities" table in
// docs/options.md - keep the two in step.
const TIER3_ROWS = [
  {
    oldCategory: "Studio",
    home: "studio",
    roleKey: null,
    detail: "credited via media_credit role studio",
  },
  {
    oldCategory: "Director",
    home: "person",
    roleKey: "director",
    detail: "scoped anime / non_anime on person_role",
  },
  { oldCategory: "Producer", home: "person", roleKey: "producer" },
  { oldCategory: "Music / Composer", home: "person", roleKey: "composer" },
  {
    oldCategory: "Manga Author",
    home: "person",
    roleKey: "manga_author",
    detail: "two credit roles imply it: 原作 and 作画",
  },
  { oldCategory: "Novel Author", home: "person", roleKey: "novel_author" },
  {
    oldCategory: "Novel Illustrator",
    home: "person",
    roleKey: "novel_illustrator",
  },
  { oldCategory: "Comic Writer", home: "person", roleKey: "comic_writer" },
  { oldCategory: "Comic Artist", home: "person", roleKey: "comic_artist" },
];

// Two Tier 1 keys knowingly disagree with their Enum class in Python. The
// page serves what /api/constants serves, so it flags the split rather than
// letting it look like a bug. See "Value Discrepancies" in docs/options.md.
const TIER1_NOTES = {
  franchise_type:
    "Diverges from the FranchiseType Enum, which has Anime and lacks Anime Movie. Preserved, not resolved.",
  anime_airing_type:
    "Carries a trailing Other that the AnimeAiringType Enum lacks. Preserved, not resolved.",
};

// Anchor id for a Tier 2 category. Categories are human-written strings with
// spaces and slashes ("Publisher / Distributor TW"), none of which belong in
// a fragment id.
function categoryId(category) {
  return `opt-${category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

// snake_case key -> the heading an admin recognises.
function prettifyKey(key) {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// The left title bar: an index of everything on the page, and the only
// practical way to reach a single Tier 2 category on a page this tall.
//
// Jumping is plain fragment links, not scrollIntoView - the browser handles
// smooth scrolling and the offset through CSS (scroll-mt-28 on each target,
// clearing the sticky nav), and the URL keeps the section so a reload or a
// shared link lands in the same place.
function TitleBar({ tier1Keys, categories, activeId }) {
  const listRef = useRef(null);
  const activeRef = useRef(null);

  // Keep the highlighted entry inside the bar's own scroll box. Without this
  // the highlight is correct but invisible: the index is taller than the
  // viewport, so scrolling into Tier 2 highlights an entry well below the
  // bar's visible window. Scrolled by hand rather than with scrollIntoView,
  // which would also scroll the page and fight the reader.
  useEffect(() => {
    const box = listRef.current;
    const link = activeRef.current;
    if (!box || !link) return;
    // Rect deltas, not offsetTop: the bar is position:sticky, which makes it
    // the links' own offsetParent, so subtracting box.offsetTop would double
    // count and clamp every jump back to the top of the list.
    const top =
      link.getBoundingClientRect().top -
      box.getBoundingClientRect().top +
      box.scrollTop;
    const bottom = top + link.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight)
      box.scrollTop = bottom - box.clientHeight;
  }, [activeId]);

  const linkProps = (id) => ({
    ref: activeId === id ? activeRef : undefined,
  });

  const linkClass = (id) =>
    `block truncate rounded px-2 py-1 text-xs font-semibold transition ${
      activeId === id
        ? "bg-gray-900 text-white"
        : "text-text-faint hover:bg-surface-2 hover:text-text"
    }`;

  return (
    <aside className="hidden lg:block w-60 shrink-0">
      <nav
        aria-label="Section index"
        ref={listRef}
        className="sticky top-28 max-h-[calc(100vh-9rem)] overflow-y-auto bg-surface border border-border rounded-2xl shadow-sm p-4"
      >
        <p className="text-[10px] font-black text-text-faint uppercase tracking-widest px-2 mb-3">
          On this page
        </p>

        <a
          href="#tier-1"
          className={linkClass("tier-1")}
          {...linkProps("tier-1")}
        >
          Tier 1 · Closed Enums
        </a>
        <div className="ml-2 border-l border-border pl-2 mt-1 mb-3">
          {tier1Keys.map((key) => (
            <a
              key={key}
              href={`#enum-${key}`}
              className={linkClass(`enum-${key}`)}
              {...linkProps(`enum-${key}`)}
            >
              {prettifyKey(key)}
            </a>
          ))}
        </div>

        <a
          href="#tier-2"
          className={linkClass("tier-2")}
          {...linkProps("tier-2")}
        >
          Tier 2 · Open Vocabularies
        </a>
        <div className="ml-2 border-l border-border pl-2 mt-1 mb-3">
          {categories.length === 0 ? (
            <span className="block px-2 py-1 text-xs text-text-faint/60">—</span>
          ) : (
            categories.map((category) => (
              <a
                key={category}
                href={`#${categoryId(category)}`}
                className={linkClass(categoryId(category))}
                {...linkProps(categoryId(category))}
                title={category}
              >
                {category}
              </a>
            ))
          )}
        </div>

        <a
          href="#tier-3"
          className={linkClass("tier-3")}
          {...linkProps("tier-3")}
        >
          Tier 3 · Entities
        </a>
      </nav>
    </aside>
  );
}

function SectionHeader({ tier, title, subtitle, source, children }) {
  return (
    <div className="border-b border-border pb-4 mb-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded">
          Tier {tier}
        </span>
        <h2 className="text-xl font-black text-text tracking-tight">
          {title}
        </h2>
        <code className="text-xs font-mono text-text-faint">{source}</code>
      </div>
      <p className="text-sm text-text-faint font-medium mt-2 max-w-3xl">
        {subtitle}
      </p>
      {children}
    </div>
  );
}

function ReadOnlyNote({ children }) {
  return (
    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 inline-flex items-center gap-2">
      <i className="fas fa-lock"></i>
      <span>{children}</span>
    </p>
  );
}

function ValueChip({ children }) {
  return (
    <span className="inline-block bg-surface-2 border border-border text-text-muted text-xs font-semibold rounded px-2 py-1">
      {children}
    </span>
  );
}

function Tier1({ constants, keys }) {
  return (
    <section
      id="tier-1"
      data-section-anchor
      className="scroll-mt-28 bg-surface rounded-2xl border border-border shadow-sm p-6"
    >
      <SectionHeader
        tier="1"
        title="Closed Enums"
        source="app/utils/constants.py"
        subtitle="Values the business logic compares against — Not Yet Aired makes Fill skip mal_rating, 完結 gates the novel volume checks. They live in code, not the database, so a rename cannot silently break a branch."
      >
        <ReadOnlyNote>
          Not editable anywhere in the app. Changing one is a code change.
        </ReadOnlyNote>
      </SectionHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {keys.map((key) => (
          <div
            key={key}
            id={`enum-${key}`}
            data-section-anchor
            className="scroll-mt-28 border border-border rounded-xl p-4 flex flex-col"
          >
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="text-sm font-black text-text">
                {prettifyKey(key)}
              </h3>
              <span className="text-[10px] font-bold text-text-faint">
                {constants[key].length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {constants[key].map((value) => (
                <ValueChip key={value}>{value}</ValueChip>
              ))}
            </div>
            {TIER1_NOTES[key] && (
              <p className="text-[11px] text-amber-700 mt-3 leading-snug">
                <i className="fas fa-triangle-exclamation mr-1"></i>
                {TIER1_NOTES[key]}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Tier2({ groups, loading }) {
  return (
    <section
      id="tier-2"
      data-section-anchor
      className="scroll-mt-28 bg-surface rounded-2xl border border-border shadow-sm p-6"
    >
      <SectionHeader
        tier="2"
        title="Open Vocabularies"
        source="system_option / system_option_scope"
        subtitle="Values only humans read. Nothing in the code compares against them, so they are safe to add, rename and reorder. One vocabulary per category; each value carries the media types it is offered in — a value with no scopes is offered everywhere."
      >
        <ReadOnlyNote>
          View only here. Add, edit and rescope these in the Options tab of{" "}
          <Link to="/add" className="underline font-bold">
            Add
          </Link>{" "}
          or{" "}
          <Link to="/modify" className="underline font-bold">
            Modify
          </Link>
          .
        </ReadOnlyNote>
      </SectionHeader>

      {loading ? (
        <p className="text-sm text-text-faint font-medium">Loading options…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-text-faint font-medium">
          No system options recorded.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(([category, rows]) => (
            <div
              key={category}
              id={categoryId(category)}
              data-section-anchor
              className="scroll-mt-28"
            >
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-sm font-black text-text">{category}</h3>
                <span className="text-[10px] font-bold text-text-faint">
                  {rows.length} value{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-text-faint">
                    <tr>
                      <th className="text-left font-black px-3 py-2 w-16">#</th>
                      <th className="text-left font-black px-3 py-2">Value</th>
                      <th className="text-left font-black px-3 py-2">Scopes</th>
                      <th className="text-left font-black px-3 py-2">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                      <tr key={row.system_id}>
                        <td className="px-3 py-2 text-text-faint font-mono text-xs">
                          {row.sort_order}
                        </td>
                        <td className="px-3 py-2 font-semibold text-text">
                          {row.value}
                        </td>
                        <td className="px-3 py-2">
                          {row.scopes.length === 0 ? (
                            <span className="text-xs text-text-faint italic">
                              everywhere
                            </span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {row.scopes.map((scope) => (
                                <span
                                  key={scope}
                                  className="bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold rounded px-1.5 py-0.5"
                                >
                                  {scope}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-text-faint">
                          {row.remark || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Tier3({ roleCounts, studioCount, loading }) {
  return (
    <section
      id="tier-3"
      data-section-anchor
      className="scroll-mt-28 bg-surface rounded-2xl border border-border shadow-sm p-6"
    >
      <SectionHeader
        tier="3"
        title="Entities"
        source="person / person_role / studio"
        subtitle="Categories that named a person or a studio became real tables — a director needs multilingual names, a rating, a photo and a remark, none of which a flat (category, value) string could hold. Counts are of distinct records; a director scoped both ways is still one person."
      >
        <ReadOnlyNote>
          View only here. People and studios are managed on their own forms in{" "}
          <Link to="/add" className="underline font-bold">
            Add
          </Link>{" "}
          and{" "}
          <Link to="/modify" className="underline font-bold">
            Modify
          </Link>
          .
        </ReadOnlyNote>
      </SectionHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="border border-border rounded-xl p-4">
          <div className="text-[10px] font-bold text-text-faint uppercase tracking-widest mb-1">
            Studio records
          </div>
          <div className="text-3xl font-black text-text tracking-tight">
            {loading ? "…" : studioCount}
          </div>
        </div>
        <div className="border border-border rounded-xl p-4">
          <div className="text-[10px] font-bold text-text-faint uppercase tracking-widest mb-1">
            Person roles held
          </div>
          <div className="text-3xl font-black text-text tracking-tight">
            {loading
              ? "…"
              : Object.values(roleCounts).reduce((a, b) => a + b, 0)}
          </div>
          <p className="text-[11px] text-text-faint mt-1">
            Sum across roles — one person holding two roles counts twice.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-[10px] uppercase tracking-widest text-text-faint">
            <tr>
              <th className="text-left font-black px-3 py-2">Old category</th>
              <th className="text-left font-black px-3 py-2">New home</th>
              <th className="text-left font-black px-3 py-2">Notes</th>
              <th className="text-right font-black px-3 py-2 w-24">Records</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {TIER3_ROWS.map((row) => (
              <tr key={row.oldCategory}>
                <td className="px-3 py-2 font-semibold text-text">
                  {row.oldCategory}
                </td>
                <td className="px-3 py-2">
                  <code className="text-xs font-mono text-text-muted">
                    {row.home}
                    {row.roleKey ? ` · ${row.roleKey}` : ""}
                  </code>
                </td>
                <td className="px-3 py-2 text-xs text-text-faint">
                  {row.detail || "—"}
                </td>
                <td className="px-3 py-2 text-right font-black text-text">
                  {loading
                    ? "…"
                    : row.roleKey
                      ? (roleCounts[row.roleKey] ?? 0)
                      : studioCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-faint mt-4 leading-relaxed max-w-3xl">
        <strong className="text-text-faint">Not built:</strong>{" "}
        <code className="font-mono">character</code> and{" "}
        <code className="font-mono">character_voice</code> were designed but
        deferred. <code className="font-mono">anime.seiyuu</code> is unrelated —
        it is a Need/Done status column, never a cast list.
      </p>
    </section>
  );
}

export default function SystemOptions() {
  // Tier 1 arrives through the same hook the whole app uses, so this page can
  // never show a different list than the dropdowns do.
  const constants = useConstants();

  const [options, setOptions] = useState([]);
  const [roleCounts, setRoleCounts] = useState({});
  const [studioCount, setStudioCount] = useState(0);
  const [tier2Loading, setTier2Loading] = useState(true);
  const [tier3Loading, setTier3Loading] = useState(true);

  useEffect(() => {
    // limit=5000 is the endpoint's ceiling. The default 1000 would silently
    // truncate an inventory page, which is the one place that must be whole.
    fetch(buildUrl(endpoints.options.list(), { limit: 5000 }), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setTier2Loading(false));

    Promise.all([
      fetch(endpoints.person.roleCounts(), { credentials: "include" })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
      // No count endpoint for studios, and none is worth adding: the list is
      // small and every admin form already fetches it.
      fetch(endpoints.studio.list(), { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([counts, studios]) => {
        setRoleCounts(counts);
        setStudioCount(studios.length);
      })
      .finally(() => setTier3Loading(false));
  }, []);

  // Derived here, not inside the sections, so the title bar and the content
  // can never disagree about what exists or in what order.
  const tier1Keys = useMemo(
    () => Object.keys(constants || {}).sort(),
    [constants],
  );

  // The endpoint already sorts by category, then sort_order, then value, so
  // grouping in arrival order preserves the intended dropdown order.
  const tier2Groups = useMemo(() => {
    const byCategory = new Map();
    options.forEach((option) => {
      if (!byCategory.has(option.category)) byCategory.set(option.category, []);
      byCategory.get(option.category).push(option);
    });
    return [...byCategory.entries()];
  }, [options]);

  // Which title-bar entry to highlight: the last anchor whose top has passed
  // under the sticky nav, which is the section you are actually reading.
  //
  // Deliberately a scroll handler rather than an IntersectionObserver. A
  // category table can be several screens tall, so the observer question
  // ("is any part of it in a thin band?") answers a different question than
  // the one being asked, and picks the wrong section whenever two anchors
  // straddle the band. Reading positions directly is exact, and anchors are
  // nested oldest-first in document order, so the last match is also the most
  // specific one (a category, not just its tier).
  const [activeId, setActiveId] = useState("tier-1");
  useEffect(() => {
    let frame = 0;

    function recompute() {
      frame = 0;
      const targets = document.querySelectorAll("[data-section-anchor]");
      let current = targets[0]?.id;
      for (const target of targets) {
        // 120px ~= the two-row sticky nav plus a hair, matching scroll-mt-28.
        if (target.getBoundingClientRect().top > 120) break;
        current = target.id;
      }
      if (current) setActiveId(current);
    }

    function onScroll() {
      // One recompute per frame: wheel and momentum scrolling fire far more
      // often than the highlight can meaningfully change.
      if (frame === 0) frame = requestAnimationFrame(recompute);
    }

    // A fragment jump fires hashchange but NO scroll event, so the position
    // spy alone would leave the highlight a click behind forever. Reading the
    // hash is also exact - it is the section the reader just asked for - and
    // sidesteps racing the browser's own jump, which lands after hashchange.
    function onHashChange() {
      const id = window.location.hash.slice(1);
      if (id) setActiveId(id);
    }

    recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("hashchange", onHashChange);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
    // Recompute once the fetched sections have rendered their anchors.
  }, [tier1Keys, tier2Groups]);

  return (
    <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-black text-text tracking-tight mb-2">
            System Options
          </h1>
          <p className="text-text-faint font-medium max-w-3xl">
            Every choice list in the app, in the three homes they live in. Read
            only — this page is an inventory, not an editor.
          </p>
        </div>
        <Link
          to="/system"
          className="bg-surface border border-border-strong text-text-muted px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-surface-2 transition shadow-sm flex items-center self-start"
        >
          <i className="fas fa-arrow-left mr-2 text-text-faint"></i> Back to Admin
        </Link>
      </div>

      {/* No items-start: the aside must stretch to the row's full height,
          otherwise it collapses to the nav's own height and the sticky nav
          runs out of track after one screen of scrolling. */}
      <div className="flex gap-8">
        <TitleBar
          tier1Keys={tier1Keys}
          categories={tier2Groups.map(([category]) => category)}
          activeId={activeId}
        />

        <div className="flex-1 min-w-0 space-y-8">
          <Tier1 constants={constants} keys={tier1Keys} />
          <Tier2 groups={tier2Groups} loading={tier2Loading} />
          <Tier3
            roleCounts={roleCounts}
            studioCount={studioCount}
            loading={tier3Loading}
          />
        </div>
      </div>
    </div>
  );
}
