// Frontend: page component file for Quotes — every quote in the library,
// grouped by the media entry it came from. Memes live on /meme; the two share
// GroupedEntryPage and differ only in their row and filters.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import GroupedEntryPage, {
  MEDIA_TYPE_FILTERS,
  Toggle,
  controlCls,
} from "../../components/layout/GroupedEntryPage";
import { Button, Chip } from "../../components/ui/primitives";
import QuoteForm, {
  emptyQuote,
  toQuotePayload,
} from "../../components/forms/QuoteForm";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { getQuoteImageUrl } from "../../lib/covers";
import {
  copyImageToClipboard,
  copyTextToClipboard,
} from "../../lib/clipboardImage";

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
      <div className="border border-brand p-3 bg-surface">
        <QuoteForm val={draft} setVal={setDraft} />
        <div className="flex gap-2 mt-3">
          <Button kind="primary" size="sm" onClick={saveEdit} disabled={busy}>
            Save
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group border border-border p-3 bg-surface hover:border-border-strong transition">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {quote.text && (
            <p className="text-base text-text italic whitespace-pre-wrap leading-relaxed">
              “{quote.text}”
            </p>
          )}
          {quote.translation && (
            <p className="mt-1 text-xs text-text-faint whitespace-pre-wrap">
              {quote.translation}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-faint">
            {quote.speaker && (
              <span className="text-text-faint">— {quote.speaker}</span>
            )}
            {quote.original_source && (
              <span>quoting {quote.original_source}</span>
            )}
            {quote.episode && <span>{quote.episode}</span>}
            {quote.language && <span>{quote.language}</span>}
            {quote.is_general && <Chip>General</Chip>}
            {quote.is_favorite && (
              <Chip tone="brand">Favorite</Chip>
            )}
            {quote.needs_review && <Chip>Needs review</Chip>}
            {/* Derived server-side: this quote is also a line of a meme. */}
            {quote.meme_id && (
              <Link to="/meme" className="hover:underline">
                <Chip>In a meme</Chip>
              </Link>
            )}
            {(quote.tags || []).map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
            {quote.link && (
              <a
                href={quote.link}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                <i className="fas fa-external-link-alt mr-1" aria-hidden="true" />
                Link
              </a>
            )}
          </div>

          {imageUrl && (
            <div className="mt-2">
              <img
                src={imageUrl}
                alt=""
                className="max-h-56 border border-border"
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
              className="h-7 w-7 text-text-faint hover:bg-surface-2 hover:text-brand"
            >
              <i className="fas fa-copy text-xs" />
            </button>
          )}
          {imageUrl && (
            <button
              onClick={copyImage}
              title="Copy image"
              className="h-7 w-7 text-text-faint hover:bg-surface-2 hover:text-brand"
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
                className={`h-7 w-7 hover:bg-surface-2 ${
                  quote.is_favorite ? "text-brand" : "text-text-faint hover:text-brand"
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
                className="h-7 w-7 text-text-faint hover:bg-surface-2 hover:text-brand"
              >
                <i className="fas fa-pen text-xs" />
              </button>
              <button
                onClick={remove}
                disabled={busy}
                title="Delete"
                className="h-7 w-7 text-text-faint hover:bg-surface-2 hover:text-danger"
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

  const [mediaType, setMediaType] = useState("");
  const [generalOnly, setGeneralOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Filtering server-side keeps the grouped shape and the entry headers intact;
  // narrowing in the browser would leave empty groups behind.
  const params = useMemo(() => {
    const p = {};
    if (mediaType) p.media_type = mediaType;
    if (generalOnly) p.is_general = true;
    if (favoritesOnly) p.is_favorite = true;
    if (reviewOnly) p.needs_review = true;
    if (search.trim()) p.search_query = search.trim();
    return p;
  }, [mediaType, generalOnly, favoritesOnly, reviewOnly, search]);

  const { data, isLoading, error } = useApiQuery(
    ["quotes-grouped"],
    endpoints.quotes.grouped(),
    { params },
  );

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: ["quotes-grouped"] });

  return (
    <GroupedEntryPage
      icon="fa-quote-left"
      title="Quotes"
      subtitle="Memorable lines, grouped by where they came from"
      groups={data || []}
      isLoading={isLoading}
      error={error}
      itemsKey="quotes"
      noun="quote"
      renderRow={(q) => (
        <QuoteRow
          key={q.system_id}
          quote={q}
          isAdmin={isAdmin}
          onChanged={refetch}
        />
      )}
      filters={
        <>
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value)}
            className={controlCls}
          >
            {MEDIA_TYPE_FILTERS.map((m) => (
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
        </>
      }
    />
  );
}
