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

// The franchise and collection pages mount the memes section on its own; it
// used to live in this file, so the import path stays valid from here.
export { MemeSection };

const SHAPES = {
  text: TextSection,
  text_links: TextLinksSection,
  episode_text: EpisodeTextSection,
  name_links: NameLinksSection,
};

// Quotes and memes are registry sections like any other - the registry gives
// their order and label - but they are backed by their own tables, so they
// read and write through their own components instead of the note handlers.
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

export default function NotesTemplate({ ownerType, ownerId, isAdmin }) {
  const [sections, setSections] = useState([]);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!ownerType || !ownerId) return;
    try {
      const [secs, rows] = await Promise.all([
        api.fetchSections(ownerType),
        api.fetchNotes(ownerType, ownerId),
      ]);
      setSections(secs);
      setNotes(rows);
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    reload();
  }, [reload]);

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
          await reload();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
      onUpdate: async (id, payload) => {
        try {
          await api.updateNote(id, payload);
          await reload();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
      onDelete: async (id) => {
        try {
          await api.deleteNote(id);
          await reload();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
      onReorder: async (section, orderedIds) => {
        try {
          await api.reorderNotes({ ownerType, ownerId, section, orderedIds });
          await reload();
        } catch (e) {
          setError(String(e.message || e));
        }
      },
    }),
    [ownerType, ownerId, reload],
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
        {sections.map((section) => {
          if (section.shape === "external") {
            // An external section this page has no component for renders
            // nothing rather than crashing.
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
        })}
      </div>
    </div>
  );
}
