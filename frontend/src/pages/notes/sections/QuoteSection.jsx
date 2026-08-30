// Frontend: the quotes section. A quote lives in its own `quote` table rather
// than in a `note` row, which is why the notes registry marks it as an
// `external` shape - the registry still supplies its position and label, and
// the page renders it like every other section.
//
// It moved out of NotesTemplate when that component became registry-driven.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import QuoteForm, {
  emptyQuote,
  toQuotePayload,
} from "../../../components/forms/QuoteForm";
import { endpoints } from "../../../api/endpoints";
import { fetchJson, jsonBody } from "../../../api/client";
import { getQuoteImageUrl } from "../../../lib/covers";
import { ItemActions, LinkPill, SaveCancel, SectionCard } from "./ui";

export default function QuoteSection({
  label,
  mediaType,
  entryId,
  isAdmin,
  onCount,
}) {
  const queryClient = useQueryClient();
  const queryKey = ["quotes-by-entry", mediaType, entryId];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchJson(endpoints.quotes.byEntry(mediaType, entryId)),
    enabled: !!mediaType && !!entryId,
    staleTime: 30_000,
  });

  // This section owns its rows, so the page cannot count them from the notes
  // it fetched. Reporting the count up is what lets the enclosing group card
  // know whether it is empty, and null says "still loading" so the group stays
  // open rather than collapsing on a count it does not have yet.
  useEffect(() => {
    onCount?.(isLoading ? null : items.length);
  }, [onCount, isLoading, items.length]);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyQuote());
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(emptyQuote());
  const [busy, setBusy] = useState(false);

  // The Quote page reads a different cache key, so both are invalidated.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["quotes-grouped"] });
  };

  const commit = async () => {
    if (!draft.text?.trim() && !draft.image_file?.trim()) return;
    setBusy(true);
    try {
      await fetchJson(endpoints.quotes.create(), {
        method: "POST",
        ...jsonBody(
          toQuotePayload(draft, {
            media_type: mediaType,
            entry_id: entryId,
            sort_index: (items.length || 0) + 1,
          }),
        ),
      });
      setDraft(emptyQuote());
      setAdding(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await fetchJson(endpoints.quotes.patch(editId), {
        method: "PATCH",
        ...jsonBody(toQuotePayload(editVal)),
      });
      setEditId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await fetchJson(endpoints.quotes.remove(id), { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      label={label}
      count={isLoading ? null : items.length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {items.map((item) => {
        const imageUrl = getQuoteImageUrl(item.image_file);
        return (
          <div
            key={item.system_id}
            className="border border-border rounded-lg p-2 bg-surface-2"
          >
            {editId === item.system_id ? (
              <div>
                <QuoteForm val={editVal} setVal={setEditVal} />
                <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
              </div>
            ) : (
              <div className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  {item.text && (
                    <p className="text-sm text-text italic whitespace-pre-wrap">
                      "{item.text}"
                    </p>
                  )}
                  {item.translation && (
                    <p className="text-xs text-text-faint whitespace-pre-wrap">
                      {item.translation}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-faint font-medium">
                    {item.speaker && (
                      <span className="text-text-faint">— {item.speaker}</span>
                    )}
                    {item.original_source && (
                      <span>quoting {item.original_source}</span>
                    )}
                    {item.episode && <span>{item.episode}</span>}
                    {item.meme_id && (
                      <span className="rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 font-bold">
                        in a meme
                      </span>
                    )}
                    {item.is_general && (
                      <span className="rounded-full bg-brand/10 text-brand px-1.5 py-0.5 font-bold">
                        general
                      </span>
                    )}
                    {item.is_favorite && (
                      <i className="fas fa-star text-amber-500" />
                    )}
                    {item.needs_review && (
                      <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 font-bold">
                        needs review
                      </span>
                    )}
                    {(item.tags || []).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-surface-2 text-text-muted px-1.5 py-0.5 font-bold"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt=""
                      className="mt-1 max-h-40 rounded-lg border border-border"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  {item.link && <LinkPill url={item.link} />}
                </div>
                <ItemActions
                  isAdmin={isAdmin}
                  onEdit={() => {
                    setEditId(item.system_id);
                    setEditVal(emptyQuote(item));
                  }}
                  onDelete={() => remove(item.system_id)}
                />
              </div>
            )}
          </div>
        );
      })}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand-soft">
          <QuoteForm val={draft} setVal={setDraft} />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(emptyQuote());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!items.length && !adding && (
        <p className="text-xs text-text-faint italic">
          {isLoading ? "Loading..." : "No entries."}
        </p>
      )}
    </SectionCard>
  );
}
