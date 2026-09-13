// Frontend: the one quote field set, shared by the entry Notes section, the
// admin Quote tab, and the inline editor on the Quote page.
import { inputCls } from "./FormField";
import ImagePicker from "./ImagePicker";

export function emptyQuote(overrides = {}) {
  return {
    text: "",
    translation: "",
    language: "",
    speaker: "",
    original_source: "",
    episode: "",
    link: "",
    image_file: "",
    pending_image_id: null,
    tags: [],
    is_general: false,
    is_favorite: false,
    needs_review: false,
    remark: "",
    ...overrides,
  };
}

/** Strips blanks so the API stores nulls rather than empty strings. */
export function toQuotePayload(val, extra = {}) {
  const clean = (v) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  return {
    text: clean(val.text),
    translation: clean(val.translation),
    language: clean(val.language),
    speaker: clean(val.speaker),
    original_source: clean(val.original_source),
    episode: clean(val.episode),
    link: clean(val.link),
    image_file: clean(val.image_file),
    tags: (val.tags || []).length ? val.tags : null,
    is_general: !!val.is_general,
    is_favorite: !!val.is_favorite,
    needs_review: !!val.needs_review,
    remark: clean(val.remark),
    ...extra,
  };
}

function Row({ label, children, hint }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-bold text-text-faint uppercase tracking-wide">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-text-faint">{hint}</p>}
    </div>
  );
}

function Check({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-brand"
      />
      <span className="text-xs text-text-muted leading-tight">
        {label}
        {hint && <span className="block text-[10px] text-text-faint">{hint}</span>}
      </span>
    </label>
  );
}

export default function QuoteForm({ val, setVal, showReview = true }) {
  const set = (key, value) => setVal({ ...val, [key]: value });

  return (
    <div className="space-y-3">
      <Row label="Language" hint="Language of the text below">
        <input
          value={val.language || ""}
          onChange={(e) => set("language", e.target.value)}
          placeholder="JP / CN / EN"
          className={inputCls}
        />
      </Row>

      <Row label="Text">
        <textarea
          value={val.text || ""}
          onChange={(e) => set("text", e.target.value)}
          rows={3}
          placeholder="The line itself"
          className={inputCls}
        />
      </Row>

      <Row label="Translation">
        <textarea
          value={val.translation || ""}
          onChange={(e) => set("translation", e.target.value)}
          rows={2}
          placeholder="Translated version (optional)"
          className={inputCls}
        />
      </Row>

      <div className="grid grid-cols-2 gap-3">
        <Row label="Speaker">
          <input
            value={val.speaker || ""}
            onChange={(e) => set("speaker", e.target.value)}
            placeholder="Who says it"
            className={inputCls}
          />
        </Row>
        <Row
          label="Original Source"
          hint="Set when the speaker is quoting someone else"
        >
          <input
            value={val.original_source || ""}
            onChange={(e) => set("original_source", e.target.value)}
            placeholder="What they are quoting from"
            className={inputCls}
          />
        </Row>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Row label="Episode">
          <input
            value={val.episode || ""}
            onChange={(e) => set("episode", e.target.value)}
            placeholder="S2E4 / Ch. 12 / Vol. 3"
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

      <Row
        label="Tags"
        hint="Comma-separated, used by the Quote page filters"
      >
        <input
          value={(val.tags || []).join(", ")}
          onChange={(e) =>
            set(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
          placeholder="encouragement, funny"
          className={inputCls}
        />
      </Row>

      <Row label="Image" hint="Upload a file or pick one already in the library">
        <ImagePicker
          ownerType="quote"
          ownerId={val.system_id}
          role="quote"
          value={val.image_file}
          onChange={(key, imageId) => {
            // No system_id yet - ImagePicker had nothing to attach to, so
            // remember the image id and attach it once the quote is saved
            // (see attachUploadedImage callers). Once system_id exists,
            // ImagePicker already attached at pick time and nothing is
            // pending.
            setVal({
              ...val,
              image_file: key,
              pending_image_id: val.system_id ? null : imageId,
            });
          }}
        />
      </Row>

      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
        <Check
          label="General"
          hint="Sendable in any conversation"
          checked={val.is_general}
          onChange={(v) => set("is_general", v)}
        />
        <Check
          label="Favorite"
          checked={val.is_favorite}
          onChange={(v) => set("is_favorite", v)}
        />
        {showReview && (
          <Check
            label="Needs review"
            checked={val.needs_review}
            onChange={(v) => set("needs_review", v)}
          />
        )}
      </div>

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
