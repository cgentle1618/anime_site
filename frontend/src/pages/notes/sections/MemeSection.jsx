// Frontend: the memes section. A meme is an ordered list of text lines plus at
// most one image; a line carrying a quote_id is also a Quote. Memes live in
// their own table, so this section talks to /api/meme rather than to /api/notes
// - which is why the notes registry marks it as an `external` shape.
//
// It moved out of NotesTemplate when that component became registry-driven;
// the franchise and collection pages mount it directly.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import MemeForm, {
  emptyMeme,
  toMemePayload,
} from "../../../components/forms/MemeForm";
import { endpoints } from "../../../api/endpoints";
import { fetchJson, jsonBody } from "../../../api/client";
import { getQuoteImageUrl } from "../../../lib/covers";
import { ItemActions, LinkPill, SaveCancel, SectionCard } from "./ui";

export default function MemeSection({
  label,
  ownerType,
  ownerId,
  isAdmin,
}) {
  const queryClient = useQueryClient();
  const queryKey = ["memes-by-owner", ownerType, ownerId];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchJson(endpoints.memes.byOwner(ownerType, ownerId)),
    enabled: !!ownerType && !!ownerId,
    staleTime: 30_000,
  });

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyMeme());
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(emptyMeme());
  const [busy, setBusy] = useState(false);

  // Creating a meme can create quotes too, so both caches are invalidated.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["memes-grouped"] });
    queryClient.invalidateQueries({ queryKey: ["quotes-by-entry", ownerType, ownerId] });
    queryClient.invalidateQueries({ queryKey: ["quotes-grouped"] });
  };

  const commit = async () => {
    if (!draft.text?.trim() && !draft.image_file?.trim()) return;
    setBusy(true);
    try {
      await fetchJson(endpoints.memes.create(), {
        method: "POST",
        ...jsonBody(
          toMemePayload(draft, {
            owner_type: ownerType,
            owner_id: ownerId,
            sort_index: (items.length || 0) + 1,
          }),
        ),
      });
      setDraft(emptyMeme());
      setAdding(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await fetchJson(endpoints.memes.patch(editId), {
        method: "PATCH",
        ...jsonBody(toMemePayload(editVal)),
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
      await fetchJson(endpoints.memes.remove(id), { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      label={label}
      count={items.length}
      isAdmin={isAdmin}
      onAdd={() => setAdding(true)}
    >
      {items.map((item) => {
        const imageUrl = getQuoteImageUrl(item.image_file);
        return (
          <div
            key={item.system_id}
            className="border border-gray-100 rounded-lg p-2 bg-gray-50"
          >
            {editId === item.system_id ? (
              <div>
                <MemeForm
                  val={editVal}
                  setVal={setEditVal}
                  ownerType={ownerType}
                  ownerId={ownerId}
                />
                <SaveCancel onSave={saveEdit} onCancel={() => setEditId(null)} />
              </div>
            ) : (
              <div className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt=""
                      className="mb-1 max-h-40 rounded-lg border border-gray-200"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  {item.text && (
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {item.text}
                      {item.quote_id && (
                        <span className="ml-1.5 rounded-full bg-brand/10 text-brand px-1.5 py-0.5 text-[10px] font-bold">
                          quote
                        </span>
                      )}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-400 font-medium">
                    {item.episode && <span>{item.episode}</span>}
                    {item.is_favorite && (
                      <i className="fas fa-star text-amber-500" />
                    )}
                    {item.remark && <span className="italic">{item.remark}</span>}
                  </div>
                  {item.link && <LinkPill url={item.link} />}
                </div>
                <ItemActions
                  isAdmin={isAdmin}
                  onEdit={() => {
                    setEditId(item.system_id);
                    setEditVal(emptyMeme(item));
                  }}
                  onDelete={() => remove(item.system_id)}
                />
              </div>
            )}
          </div>
        );
      })}
      {adding && (
        <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5">
          <MemeForm
            val={draft}
            setVal={setDraft}
            ownerType={ownerType}
            ownerId={ownerId}
          />
          <SaveCancel
            onSave={commit}
            onCancel={() => {
              setDraft(emptyMeme());
              setAdding(false);
            }}
          />
        </div>
      )}
      {!items.length && !adding && (
        <p className="text-xs text-gray-400 italic">
          {isLoading ? "Loading..." : "No entries."}
        </p>
      )}
    </SectionCard>
  );
}
