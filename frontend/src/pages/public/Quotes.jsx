// Frontend: page component file for Quotes — every quote in the library,
// grouped by the media entry it comes from.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import MediaLoadingState from "../../components/layout/MediaLoadingState";
import QuoteForm, {
  emptyQuote,
  toQuotePayload,
} from "../../components/forms/QuoteForm";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { getCoverUrl, getQuoteImageUrl } from "../../lib/covers";
import { copyImageToClipboard, copyTextToClipboard } from "../../lib/clipboardImage";

const MEDIA_TYPES = [
  { value: "", label: "All media" },
  { value: "anime", label: "Anime" },
  { value: "anime-movie", label: "Anime Movie" },
  { value: "movie", label: "Movie" },
  { value: "tv-show", label: "TV Show" },
  { value: "cartoon", label: "Cartoon" },
  { value: "manga", label: "Manga" },
  { value: "novel", label: "Novel" },
];

const KINDS = [
  { value: "", label: "All" },
  { value: "quote", label: "Quotes" },
  { value: "meme", label: "Memes" },
];

const controlCls =
  "bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30";

function Pill({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    brand: "bg-brand/10 text-brand",
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Toggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
        active
          ? "bg-brand/10 text-brand"
          : "bg-white border border-gray-200 text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function QuoteRow({ quote, isAdmin, onChanged }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptyQuote());
  const [busy, setBusy] = useState(false);

  const imageUrl = getQuoteImageUrl(quote.image_file);

  const patch = async (body) => {
    setBusy(true);
    try {
      await fetchJson(endpoints.quotes.patch(quote.system_id), {
        method: "PATCH",
        ...jsonBody(body),
      });
      await onChanged();
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await fetchJson(endpoints.quotes.patch(quote.system_id), {
        method: "PATCH",
        ...jsonBody(toQuotePayload(draft)),
      });
      setEditing(false);
      await onChanged();
      showToast("success", "Quote updated.");
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await fetchJson(endpoints.quotes.remove(quote.system_id), {
        method: "DELETE",
      });
      await onChanged();
      showToast("success", "Quote deleted.");
    } catch (err) {
      showToast("error", err.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const copyImage = async () => {
    const res = await copyImageToClipboard(imageUrl);
    showToast(res.ok ? "success" : "error", res.ok ? "Image copied." : res.error);
  };

  const copyText = async () => {
    const res = await copyTextToClipboard(quote.text);
    showToast(res.ok ? "success" : "error", res.ok ? "Text copied." : res.error);
  };

  if (editing) {
    return (
      <div className="border border-brand/30 rounded-lg p-3 bg-brand/5">
        <QuoteForm val={draft} setVal={setDraft} />
        <div className="flex gap-2 mt-3">
          <button
            onClick={saveEdit}
            disabled={busy}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group border border-gray-100 rounded-lg p-3 bg-gray-50/70 hover:bg-gray-50 transition">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {quote.text && (
            <p className="text-base text-gray-800 italic whitespace-pre-wrap leading-relaxed">
              “{quote.text}”
            </p>
          )}
          {quote.translation && (
            <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">
              {quote.translation}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 font-medium">
            {quote.speaker && (
              <span className="text-gray-500">— {quote.speaker}</span>
            )}
            {quote.original_source && (
              <span>quoting {quote.original_source}</span>
            )}
            {quote.episode && <span>{quote.episode}</span>}
            {quote.language && <span>{quote.language}</span>}
            {quote.kind === "meme" && <Pill tone="violet">meme</Pill>}
            {quote.is_general && <Pill tone="brand">general</Pill>}
            {quote.is_favorite && (
              <Pill tone="amber">
                <i className="fas fa-star" />
              </Pill>
            )}
            {quote.needs_review && <Pill tone="amber">needs review</Pill>}
            {(quote.tags || []).map((t) => (
              <Pill key={t}>{t}</Pill>
            ))}
            {quote.link && (
              <a
                href={quote.link}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                <i className="fas fa-link mr-1" />
                link
              </a>
            )}
          </div>

          {imageUrl && (
            <div className="mt-2">
              <img
                src={imageUrl}
                alt=""
                className="max-h-56 rounded-lg border border-gray-200"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          {quote.text && (
            <button
              onClick={copyText}
              title="Copy text"
              className="h-7 w-7 rounded-lg text-gray-400 hover:bg-white hover:text-brand"
            >
              <i className="fas fa-copy text-xs" />
            </button>
          )}
          {imageUrl && (
            <button
              onClick={copyImage}
              title="Copy image"
              className="h-7 w-7 rounded-lg text-gray-400 hover:bg-white hover:text-brand"
            >
              <i className="fas fa-image text-xs" />
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => patch({ is_favorite: !quote.is_favorite })}
                disabled={busy}
                title="Toggle favorite"
                className={`h-7 w-7 rounded-lg hover:bg-white ${
                  quote.is_favorite
                    ? "text-amber-500"
                    : "text-gray-400 hover:text-amber-500"
                }`}
              >
                <i className="fas fa-star text-xs" />
              </button>
              <button
                onClick={() => {
                  setDraft(emptyQuote(quote));
                  setEditing(true);
                }}
                title="Edit"
                className="h-7 w-7 rounded-lg text-gray-400 hover:bg-white hover:text-brand"
              >
                <i className="fas fa-pen text-xs" />
              </button>
              <button
                onClick={remove}
                disabled={busy}
                title="Delete"
                className="h-7 w-7 rounded-lg text-gray-400 hover:bg-white hover:text-red-500"
              >
                <i className="fas fa-trash text-xs" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Quotes() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [generalOnly, setGeneralOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Filtering server-side keeps the grouped shape and the entry headers intact;
  // narrowing in the browser would leave empty groups behind.
  const params = useMemo(() => {
    const p = {};
    if (kind) p.kind = kind;
    if (mediaType) p.media_type = mediaType;
    if (generalOnly) p.is_general = true;
    if (favoritesOnly) p.is_favorite = true;
    if (reviewOnly) p.needs_review = true;
    if (search.trim()) p.search_query = search.trim();
    return p;
  }, [kind, mediaType, generalOnly, favoritesOnly, reviewOnly, search]);

  const { data, isLoading, error } = useApiQuery(
    ["quotes-grouped"],
    endpoints.quotes.grouped(),
    { params },
  );

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: ["quotes-grouped"] });

  const groups = data || [];
  const totalQuotes = groups.reduce((n, g) => n + (g.quotes?.length || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <i className="fas fa-quote-left text-brand text-lg"></i>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            Quotes
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Memorable lines and memes, grouped by where they came from
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={controlCls}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <select
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value)}
          className={controlCls}
        >
          {MEDIA_TYPES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <Toggle active={generalOnly} onClick={() => setGeneralOnly((v) => !v)}>
          General
        </Toggle>
        <Toggle
          active={favoritesOnly}
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          <i className="fas fa-star mr-1" />
          Favorites
        </Toggle>
        {isAdmin && (
          <Toggle active={reviewOnly} onClick={() => setReviewOnly((v) => !v)}>
            Needs review
          </Toggle>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search text, speaker, source..."
          className={`${controlCls} flex-1 min-w-[180px]`}
        />
      </div>

      {isLoading || error ? (
        <MediaLoadingState
          isLoading={isLoading}
          error={error}
          loadingText="Loading quotes..."
          errorTitle="Error loading quotes."
        />
      ) : (
        <>
          <p className="text-xs text-gray-400 font-medium">
            {totalQuotes} quote{totalQuotes === 1 ? "" : "s"} across{" "}
            {groups.length} entr{groups.length === 1 ? "y" : "ies"}
          </p>

          {!groups.length && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <p className="text-sm text-gray-400 italic">
                No quotes match these filters.
              </p>
            </div>
          )}

          <div className="space-y-6">
            {groups.map((group) => (
              <div
                key={`${group.media_type}-${group.entry_id}`}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* Entry header */}
                <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                  {group.missing ? (
                    <>
                      <div className="w-9 h-12 rounded bg-gray-100 flex items-center justify-center shrink-0">
                        <i className="fas fa-unlink text-gray-300 text-xs" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-400 italic">
                          Unlinked / deleted entry
                        </p>
                        <p className="text-[10px] text-gray-300 font-mono truncate">
                          {group.media_type} · {group.entry_id}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <img
                        src={getCoverUrl(group.cover_image_file)}
                        alt=""
                        className="w-9 h-12 rounded object-cover shrink-0 border border-gray-100"
                      />
                      <div className="min-w-0">
                        <Link
                          to={group.entry_nav_path || "#"}
                          className="text-sm font-bold text-gray-900 hover:text-brand truncate block"
                        >
                          {group.entry_display_name}
                        </Link>
                        <p className="text-[10px] text-gray-400 font-medium">
                          {group.quotes.length} quote
                          {group.quotes.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="p-3 space-y-2">
                  {group.quotes.map((q) => (
                    <QuoteRow
                      key={q.system_id}
                      quote={q}
                      isAdmin={isAdmin}
                      onChanged={refetch}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
