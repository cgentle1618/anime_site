// Frontend: the notes page for every owner type.
//
// The page no longer knows what a section is: it fetches the registry from
// /api/notes/sections and dispatches on each section's shape. That is why the
// seven configs/*.js files are gone - the backend owns the structure now.
import { useCallback, useEffect, useMemo, useState } from "react";

import * as api from "./api";
import TextSection from "./sections/TextSection";
import TextLinksSection from "./sections/TextLinksSection";
import EpisodeTextSection from "./sections/EpisodeTextSection";
import NameLinksSection from "./sections/NameLinksSection";
import QuoteSection from "./sections/QuoteSection";
import MemeSection from "./sections/MemeSection";

const SHAPES = {
  text: TextSection,
  text_links: TextLinksSection,
  episode_text: EpisodeTextSection,
  name_links: NameLinksSection,
};

// The first of two deliberate, scoped exceptions to "the frontend never names
// sections". (The second is the `hideSections` prop below.)
// The four shapes above are fully registry-driven: the backend can add, drop or
// relabel a `text` section and this file never changes. An `external` section
// cannot work that way - quotes and memes are backed by their own tables, their
// own endpoints and their own long-lived components, so rendering one means
// naming a component for it. Keying that off the section key (rather than
// minting a shape per section) keeps the exception to this map: the registry
// still decides whether the section exists at all, where it sits, and what it
// is called, and an external key with no component here degrades to null.
//
// Their props predate this page's shape contract, so each is adapted here
// rather than rewritten. media_type/entry_id and owner_type/owner_id are the
// same hyphenated owner keys the notes API uses.
const EXTERNAL_SHAPES = {
  quotes: ({ label, ownerType, ownerId, isAdmin }) => (
    <QuoteSection
      label={label}
      mediaType={ownerType}
      entryId={ownerId}
      isAdmin={isAdmin}
    />
  ),
  memes: ({ label, ownerType, ownerId, isAdmin }) => (
    <MemeSection
      label={label}
      ownerType={ownerType}
      ownerId={ownerId}
      isAdmin={isAdmin}
    />
  ),
};

// The second scoped exception to "the frontend never names sections":
// `hideSections` lets an embedding screen suppress sections it already renders
// itself. Only `remark` needs it today, and it needs it badly - `remark` is a
// singleton row, and the Add form, the Modify tabs and the hub pages all keep a
// dedicated remark editor that writes the SAME row through the owner router.
// Rendering this page's `remark` section beside one of those puts two editors
// on one row: the dedicated editor submits state captured at page load, so it
// silently reverts anything typed in the notes box - and when the entry had no
// remark at load, it submits null and DELETES the row outright. Suppressing the
// duplicate is what keeps that from happening. The registry still owns the
// structure: the caller names a section it renders itself, never a new one, and
// a screen with no dedicated editor (pass nothing) still shows every section.
export default function NotesTemplate({
  ownerType,
  ownerId,
  isAdmin,
  hideSections = [],
}) {
  const [sections, setSections] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Only the rows change while the page is open, so a mutation refetches them
  // alone; the registry is static for the session.
  const reloadNotes = useCallback(async () => {
    if (!ownerType || !ownerId) return;
    try {
      setNotes(await api.fetchNotes(ownerType, ownerId));
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    // Nothing to fetch without an owner, so stop loading rather than spinning
    // forever: `loading` starts true, and every call site reaches this hook.
    if (!ownerType || !ownerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.fetchSections(ownerType),
      api.fetchNotes(ownerType, ownerId),
    ])
      .then(([secs, rows]) => {
        if (cancelled) return;
        setSections(secs);
        setNotes(rows);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message || e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerType, ownerId]);

  // Callers pass a fresh array literal on every render, so the join keeps this
  // memo from recomputing on identity alone.
  const hiddenKey = hideSections.join(",");
  const visibleSections = useMemo(() => {
    const hidden = new Set(hiddenKey ? hiddenKey.split(",") : []);
    return sections.filter((s) => !hidden.has(s.key));
  }, [sections, hiddenKey]);

  const bySection = useMemo(() => {
    const map = {};
    for (const n of notes) (map[n.section] ||= []).push(n);
    return map;
  }, [notes]);

  const handlers = useMemo(
    () => ({
      onCreate: async (payload) => {
        try {
          await api.createNote({
            owner_type: ownerType,
            owner_id: ownerId,
            ...payload,
          });
          await reloadNotes();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
      onUpdate: async (id, payload) => {
        try {
          await api.updateNote(id, payload);
          await reloadNotes();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
      onDelete: async (id) => {
        try {
          await api.deleteNote(id);
          await reloadNotes();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
    }),
    [ownerType, ownerId, reloadNotes],
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <h3 className="font-bold text-gray-800">
          <i className="fas fa-book-open text-brand mr-2"></i>Notes
        </h3>
      </div>
      <div className="p-4 space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <div className="py-10 text-center text-gray-400">
            <i className="fas fa-circle-notch fa-spin text-xl"></i>
            <p className="text-xs mt-2">Loading notes...</p>
          </div>
        ) : (
          visibleSections.map((section) => {
            if (section.shape === "external") {
              const External = EXTERNAL_SHAPES[section.key];
              if (!External) return null;
              return (
                <External
                  key={section.key}
                  label={section.label}
                  ownerType={ownerType}
                  ownerId={ownerId}
                  isAdmin={isAdmin}
                />
              );
            }
            const Component = SHAPES[section.shape];
            if (!Component) return null;
            return (
              <Component
                key={section.key}
                section={section}
                notes={bySection[section.key] || []}
                isAdmin={isAdmin}
                {...handlers}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
