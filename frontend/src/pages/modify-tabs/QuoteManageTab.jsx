// Frontend: Quote tab body shared by the Modify and Delete admin pages.
//
// One component with a `mode` prop rather than two near-identical ones: a
// quote has no cover, names, or hierarchy, so both pages need the same short
// list and differ only in what the row button does.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import QuoteForm, {
  emptyQuote,
  toQuotePayload,
} from "../../components/forms/QuoteForm";
import QuoteEntryPicker from "../../components/forms/QuoteEntryPicker";
import { inputCls } from "../../components/forms/FormField";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getQuoteImageUrl } from "../../lib/covers";

export default function QuoteManageTab({ mode = "modify" }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [mediaType, setMediaType] = useState("");
  const [entryId, setEntryId] = useState(null);
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState(emptyQuote());
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);

  const params = useMemo(() => {
    const p = {};
    if (mediaType) p.media_type = mediaType;
    if (entryId) p.entry_id = entryId;
    if (search.trim()) p.search_query = search.trim();
    return p;
  }, [mediaType, entryId, search]);

  const queryKey = ["quotes-admin", params];
  const { data: quotes = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const qs = new URLSearchParams(params).toString();
      return fetchJson(endpoints.quotes.list(qs));
    },
    staleTime: 10_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["quotes-admin"] });
    queryClient.invalidateQueries({ queryKey: ["quotes-grouped"] });
    queryClient.invalidateQueries({ queryKey: ["quotes-by-entry"] });
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
      showToast("success", "Quote updated.");
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await fetchJson(endpoints.quotes.remove(id), { method: "DELETE" });
      setConfirmId(null);
      await refresh();
      showToast("success", "Quote deleted.");
    } catch (err) {
      showToast("error", err.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const isDelete = mode === "delete";

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
        <QuoteEntryPicker
          mediaType={mediaType}
          entryId={entryId}
          onChange={(mt, eid) => {
            setMediaType(mt || "");
            setEntryId(eid);
          }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search quotes to ${isDelete ? "delete" : "modify"}...`}
          className={inputCls}
        />
        <p className="text-[11px] text-gray-400 font-medium">
          {isLoading
            ? "Loading..."
            : `${quotes.length} quote${quotes.length === 1 ? "" : "s"} shown`}
        </p>
      </div>

      {quotes.map((q) => {
        const imageUrl = getQuoteImageUrl(q.image_file);
        return (
          <div
            key={q.system_id}
            className={`bg-white rounded-2xl border shadow-sm p-4 ${
              isDelete ? "border-red-100" : "border-gray-200"
            }`}
          >
            {editId === q.system_id ? (
              <>
                <QuoteForm val={editVal} setVal={setEditVal} />
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
                    className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-black text-gray-600 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {q.text && (
                    <p className="text-sm text-gray-800 italic whitespace-pre-wrap">
                      “{q.text}”
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400 font-medium">
                    {q.speaker && (
                      <span className="text-gray-500">— {q.speaker}</span>
                    )}
                    {q.episode && <span>{q.episode}</span>}
                    {q.kind === "meme" && <span>meme</span>}
                    {q.needs_review && (
                      <span className="text-amber-600">needs review</span>
                    )}
                    <span className="text-gray-300">·</span>
                    <span className={q.missing ? "text-red-400 italic" : ""}>
                      {q.missing
                        ? "unlinked entry"
                        : q.entry_display_name || "-"}
                    </span>
                  </div>
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt=""
                      className="mt-2 max-h-32 rounded-lg border border-gray-200"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </div>

                {isDelete ? (
                  confirmId === q.system_id ? (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => remove(q.system_id)}
                        disabled={busy}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-black text-gray-600 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(q.system_id)}
                      className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-100"
                    >
                      <i className="fas fa-trash mr-1" />
                      Delete
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => {
                      setEditId(q.system_id);
                      setEditVal(emptyQuote(q));
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

      {!isLoading && !quotes.length && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-sm text-gray-400 italic">No quotes found.</p>
        </div>
      )}
    </div>
  );
}
