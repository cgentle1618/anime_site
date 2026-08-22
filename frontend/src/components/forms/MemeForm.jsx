// Frontend: the one meme field set, shared by the entry/hub Notes sections, the
// admin Meme tab, and the inline editor on the Meme page.
//
// A meme is one text, one image, or one of each — never a list. The text may
// also be a Quote, in which case `quote_id` names it.
import { useState } from "react";

import { inputCls } from "./FormField";
import ComboBox from "./ComboBox";
import { isTierOwner } from "./MemeOwnerPicker";
import { getQuoteImageUrl } from "../../lib/covers";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";

export function emptyMeme(overrides = {}) {
  return {
    text: "",
    image_file: "",
    quote_id: null,
    episode: "",
    link: "",
    is_favorite: false,
    remark: "",
    ...overrides,
  };
}

/** Strips blanks so the API stores nulls rather than empty strings. */
export function toMemePayload(val, extra = {}) {
  const clean = (v) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  return {
    text: clean(val.text),
    image_file: clean(val.image_file),
    quote_id: val.quote_id || null,
    episode: clean(val.episode),
    link: clean(val.link),
    is_favorite: !!val.is_favorite,
    remark: clean(val.remark),
    ...extra,
  };
}

function Row({ label, children, hint }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

export default function MemeForm({ val, setVal, ownerType, ownerId }) {
  const set = (key, value) => setVal({ ...val, [key]: value });
  const [creating, setCreating] = useState(false);
  const imageUrl = getQuoteImageUrl(val.image_file);

  // Quotes are entry-only, so a tier-owned meme has none of its own to link and
  // the control is hidden entirely.
  const canLinkQuote = !!ownerType && !!ownerId && !isTierOwner(ownerType);
  const { data: quotes = [], refetch } = useApiQuery(
    ["quotes-for-meme", ownerType, ownerId],
    canLinkQuote ? endpoints.quotes.byEntry(ownerType, ownerId) : null,
    { enabled: canLinkQuote },
  );

  const quoteItems = quotes.map((q) => ({
    id: q.system_id,
    label: (q.text || "").slice(0, 60) || "(no text)",
  }));
  const linkedQuote = quotes.find(
    (q) => String(q.system_id) === String(val.quote_id),
  );

  const createQuote = async () => {
    const text = (val.text || "").trim();
    if (!text || !canLinkQuote) return;
    setCreating(true);
    try {
      const created = await fetchJson(endpoints.quotes.create(), {
        method: "POST",
        ...jsonBody({
          media_type: ownerType,
          entry_id: ownerId,
          text,
          needs_review: true,
        }),
      });
      set("quote_id", created.system_id);
      refetch();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <Row label="Text" hint="The meme itself — can be a single word">
        <textarea
          value={val.text || ""}
          onChange={(e) => set("text", e.target.value)}
          rows={2}
          placeholder="Leave blank for an image-only meme"
          className={inputCls}
        />
      </Row>

      {canLinkQuote && (
        <Row
          label="Also a quote"
          hint="Link the Quote this text is, if it is one"
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <ComboBox
                items={quoteItems}
                selectedId={val.quote_id}
                inputText={
                  linkedQuote ? (linkedQuote.text || "").slice(0, 60) : ""
                }
                onSelect={(item) => set("quote_id", item?.id ?? null)}
                onClear={() => set("quote_id", null)}
                placeholder="Not a quote — search to link one..."
              />
            </div>
            {!val.quote_id && (val.text || "").trim() && (
              <button
                type="button"
                onClick={createQuote}
                disabled={creating}
                title="Create a quote from this text"
                className="shrink-0 rounded-lg bg-brand/10 px-2 py-1.5 text-[10px] font-bold text-brand hover:bg-brand/20 disabled:opacity-50"
              >
                {creating ? "..." : "+ New quote"}
              </button>
            )}
          </div>
        </Row>
      )}

      {/* Local only: getQuoteImageUrl returns null off localhost, so this whole
          block disappears in production. */}
      {getQuoteImageUrl("probe.png") && (
        <Row
          label="Image"
          hint="Filename inside static/quotes/ — at most one, local only"
        >
          <input
            value={val.image_file || ""}
            onChange={(e) => set("image_file", e.target.value)}
            placeholder="my-meme.png"
            className={inputCls}
          />
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="mt-2 max-h-40 rounded-lg border border-gray-200"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </Row>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Row label="Episode">
          <input
            value={val.episode || ""}
            onChange={(e) => set("episode", e.target.value)}
            placeholder="S2E4 / Ch. 12"
            className={inputCls}
          />
        </Row>
        <Row label="Link">
          <input
            value={val.link || ""}
            onChange={(e) => set("link", e.target.value)}
            placeholder="https://..."
            className={inputCls}
          />
        </Row>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!val.is_favorite}
          onChange={(e) => set("is_favorite", e.target.checked)}
          className="accent-brand"
        />
        <span className="text-xs text-gray-700">Favorite</span>
      </label>

      <Row label="Remark">
        <input
          value={val.remark || ""}
          onChange={(e) => set("remark", e.target.value)}
          placeholder="Free-form note (optional)"
          className={inputCls}
        />
      </Row>
    </div>
  );
}
