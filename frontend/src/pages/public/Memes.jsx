// Frontend: page component file for Memes — every meme in the library, grouped
// by the media entry it came from. Shares GroupedEntryPage with /quote.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import GroupedEntryPage, {
  Pill,
  Toggle,
  controlCls,
} from "../../components/layout/GroupedEntryPage";
import { OWNER_TYPE_OPTIONS } from "../../components/forms/MemeOwnerPicker";
import MemeForm, { emptyMeme, toMemePayload } from "../../components/forms/MemeForm";
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

function MemeRow({ meme, isAdmin, onChanged }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptyMeme());
  const [busy, setBusy] = useState(false);

  const imageUrl = getQuoteImageUrl(meme.image_file);

  const patch = async (body) => {
    setBusy(true);
    try {
      await fetchJson(endpoints.memes.patch(meme.system_id), {
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
      await fetchJson(endpoints.memes.patch(meme.system_id), {
        method: "PATCH",
        ...jsonBody(toMemePayload(draft)),
      });
      setEditing(false);
      await onChanged();
      showToast("success", "Meme updated.");
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await fetchJson(endpoints.memes.remove(meme.system_id), {
        method: "DELETE",
      });
      await onChanged();
      showToast("success", "Meme deleted.");
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
    const res = await copyTextToClipboard(meme.text);
    showToast(res.ok ? "success" : "error", res.ok ? "Text copied." : res.error);
  };

  if (editing) {
    return (
      <div className="border border-brand/30 rounded-lg p-3 bg-brand-soft">
        <MemeForm
          val={draft}
          setVal={setDraft}
          ownerType={meme.owner_type}
          ownerId={meme.owner_id}
        />
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
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-text-muted hover:bg-surface-3"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group border border-border rounded-lg p-3 bg-surface-2/70 hover:bg-surface-2 transition">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* The image has no stored position — a meme has at most one, and it
              always leads. */}
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="mb-2 max-h-64 rounded-lg border border-border"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}

          {meme.text && (
            <p className="text-base text-text whitespace-pre-wrap leading-relaxed">
              {meme.text}
              {/* quote_id is a real FK with ON DELETE SET NULL, so a deleted
                  quote simply unlinks — there is no dangling state to render. */}
              {meme.quote_id && (
                <span className="ml-2 align-middle">
                  <Pill tone="brand">
                    <i className="fas fa-quote-left" />
                    {meme.quote_speaker || "quote"}
                  </Pill>
                </span>
              )}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-faint font-medium">
            {meme.episode && <span>{meme.episode}</span>}
            {meme.is_favorite && (
              <Pill tone="amber">
                <i className="fas fa-star" />
              </Pill>
            )}
            {meme.remark && <span className="italic">{meme.remark}</span>}
            {meme.link && (
              <a
                href={meme.link}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                <i className="fas fa-link mr-1" />
                link
              </a>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          {meme.text && (
            <button
              onClick={copyText}
              title="Copy text"
              className="h-7 w-7 rounded-lg text-text-faint hover:bg-surface hover:text-brand"
            >
              <i className="fas fa-copy text-xs" />
            </button>
          )}
          {imageUrl && (
            <button
              onClick={copyImage}
              title="Copy image"
              className="h-7 w-7 rounded-lg text-text-faint hover:bg-surface hover:text-brand"
            >
              <i className="fas fa-image text-xs" />
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => patch({ is_favorite: !meme.is_favorite })}
                disabled={busy}
                title="Toggle favorite"
                className={`h-7 w-7 rounded-lg hover:bg-surface ${
                  meme.is_favorite
                    ? "text-amber-500"
                    : "text-text-faint hover:text-amber-500"
                }`}
              >
                <i className="fas fa-star text-xs" />
              </button>
              <button
                onClick={() => {
                  setDraft(emptyMeme(meme));
                  setEditing(true);
                }}
                title="Edit"
                className="h-7 w-7 rounded-lg text-text-faint hover:bg-surface hover:text-brand"
              >
                <i className="fas fa-pen text-xs" />
              </button>
              <button
                onClick={remove}
                disabled={busy}
                title="Delete"
                className="h-7 w-7 rounded-lg text-text-faint hover:bg-surface hover:text-red-500"
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

export default function Memes() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [ownerType, setOwnerType] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState("");

  const params = useMemo(() => {
    const p = {};
    if (ownerType) p.owner_type = ownerType;
    if (favoritesOnly) p.is_favorite = true;
    if (search.trim()) p.search_query = search.trim();
    return p;
  }, [ownerType, favoritesOnly, search]);

  const { data, isLoading, error } = useApiQuery(
    ["memes-grouped"],
    endpoints.memes.grouped(),
    { params },
  );

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: ["memes-grouped"] });

  return (
    <GroupedEntryPage
      icon="fa-face-grin-squint"
      title="Memes"
      subtitle="Jokes and running gags, grouped by the entry or franchise they belong to"
      groups={data || []}
      isLoading={isLoading}
      error={error}
      itemsKey="memes"
      noun="meme"
      renderRow={(m) => (
        <MemeRow
          key={m.system_id}
          meme={m}
          isAdmin={isAdmin}
          onChanged={refetch}
        />
      )}
      filters={
        <>
          {/* Ten owner types, grouped so the tiers read as a distinct kind. */}
          <select
            value={ownerType}
            onChange={(e) => setOwnerType(e.target.value)}
            className={controlCls}
          >
            <option value="">All owners</option>
            <optgroup label="Media Entry">
              {OWNER_TYPE_OPTIONS.filter((o) => !o.tier).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Grouping Tier">
              {OWNER_TYPE_OPTIONS.filter((o) => o.tier).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          </select>
          <Toggle
            active={favoritesOnly}
            onClick={() => setFavoritesOnly((v) => !v)}
          >
            <i className="fas fa-star mr-1" />
            Favorites
          </Toggle>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meme text..."
            className={`${controlCls} flex-1 min-w-[180px]`}
          />
        </>
      }
    />
  );
}
