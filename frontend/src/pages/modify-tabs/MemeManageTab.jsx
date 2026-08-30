// Frontend: Meme tab body shared by the Modify and Delete admin pages.
//
// One component with a `mode` prop rather than two near-identical ones, for the
// same reason QuoteManageTab is: a meme has no cover, names, or hierarchy, so
// both pages need the same short list and differ only in the row button.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import MemeForm, { emptyMeme, toMemePayload } from "../../components/forms/MemeForm";
import MemeOwnerPicker from "../../components/forms/MemeOwnerPicker";
import { inputCls } from "../../components/forms/FormField";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getQuoteImageUrl } from "../../lib/covers";

export default function MemeManageTab({ mode = "modify" }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [ownerType, setOwnerType] = useState("");
  const [ownerId, setOwnerId] = useState(null);
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(emptyMeme());
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);

  const params = useMemo(() => {
    const p = {};
    if (ownerType) p.owner_type = ownerType;
    if (ownerId) p.owner_id = ownerId;
    if (search.trim()) p.search_query = search.trim();
    return p;
  }, [ownerType, ownerId, search]);

  const queryKey = ["memes-admin", params];
  const { data: memes = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const qs = new URLSearchParams(params).toString();
      return fetchJson(endpoints.memes.list(qs));
    },
    staleTime: 10_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["memes-admin"] });
    queryClient.invalidateQueries({ queryKey: ["memes-grouped"] });
    queryClient.invalidateQueries({ queryKey: ["memes-by-owner"] });
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
      showToast("success", "Meme updated.");
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await fetchJson(endpoints.memes.remove(id), { method: "DELETE" });
      setConfirmId(null);
      await refresh();
      showToast("success", "Meme deleted.");
    } catch (err) {
      showToast("error", err.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const isDelete = mode === "delete";

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-4 space-y-3">
        <MemeOwnerPicker
          ownerType={ownerType}
          ownerId={ownerId}
          onChange={(ot, oid) => {
            setOwnerType(ot || "");
            setOwnerId(oid);
          }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search memes to ${isDelete ? "delete" : "modify"}...`}
          className={inputCls}
        />
        <p className="text-[11px] text-text-faint font-medium">
          {isLoading
            ? "Loading..."
            : `${memes.length} meme${memes.length === 1 ? "" : "s"} shown`}
        </p>
      </div>

      {memes.map((m) => {
        const imageUrl = getQuoteImageUrl(m.image_file);
        return (
          <div
            key={m.system_id}
            className={`bg-surface rounded-2xl border shadow-sm p-4 ${
              isDelete ? "border-red-100" : "border-border"
            }`}
          >
            {editId === m.system_id ? (
              <>
                <MemeForm
                  val={editVal}
                  setVal={setEditVal}
                  ownerType={m.owner_type}
                  ownerId={m.owner_id}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={saveEdit}
                    disabled={busy}
                    className="rounded-lg bg-brand px-4 py-2 text-xs font-black text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="rounded-lg bg-surface-2 px-4 py-2 text-xs font-black text-text-muted hover:bg-surface-3"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt=""
                      className="mb-2 max-h-32 rounded-lg border border-border"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  {m.text && (
                    <p className="text-sm text-text whitespace-pre-wrap">
                      {m.text}
                      {m.quote_id && (
                        <span className="ml-1.5 text-[10px] font-bold text-brand">
                          quote
                        </span>
                      )}
                    </p>
                  )}
                  {!m.text && !imageUrl && (
                    <p className="text-sm text-text-faint italic">(empty)</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-faint font-medium">
                    {m.episode && <span>{m.episode}</span>}
                    {m.owner_is_tier && m.owner_label && (
                      <span className="text-brand font-bold">
                        {m.owner_label}
                      </span>
                    )}
                    <span className="text-text-faint/60">·</span>
                    <span className={m.missing ? "text-red-400 italic" : ""}>
                      {m.missing
                        ? "unlinked owner"
                        : m.owner_display_name || "-"}
                    </span>
                  </div>
                </div>

                {isDelete ? (
                  confirmId === m.system_id ? (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => remove(m.system_id)}
                        disabled={busy}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-black text-text-muted hover:bg-surface-3"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(m.system_id)}
                      className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-100"
                    >
                      <i className="fas fa-trash mr-1" />
                      Delete
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => {
                      setEditId(m.system_id);
                      setEditVal(emptyMeme(m));
                    }}
                    className="shrink-0 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-black text-brand hover:bg-brand/20"
                  >
                    <i className="fas fa-pen mr-1" />
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!isLoading && !memes.length && (
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-8 text-center">
          <p className="text-sm text-text-faint italic">No memes found.</p>
        </div>
      )}
    </div>
  );
}
