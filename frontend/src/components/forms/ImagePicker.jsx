// Frontend: an inline "pick or upload an image" control.
//
// Upload and attach are two separate API calls (see app/routers/images.py) -
// an image can exist in the library with no owner, and this widget just makes
// both calls in sequence so the caller sees one action.
//
// A brand-new quote or meme has no ownerId at all until it is first saved, so
// there is deliberately nothing to attach to yet - attach is skipped with no
// error, and `onChange` is called with the picked image's id as well as its
// storage key so the surrounding form can attach it once the row exists (see
// `attachUploadedImage` below, used by QuoteForm/MemeForm's save flow). That
// is the ONLY case attach is silently skipped here: once an ownerId exists,
// attach is attempted and a failure is surfaced, not swallowed - a 400 for an
// unsupported owner type or a 404 from the content-label gate is a real
// failure the caller needs to see, not a no-op. The upload still succeeds and
// the key is still handed to onChange either way, so the reference is never
// lost even when the attach itself did not go through.
import { useRef, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { getCoverUrl } from "../../lib/covers";
import { useAttachImage, useImages, useUploadImage } from "../../hooks/useImages";
import { Button } from "../ui/primitives";

// Attaches an already-uploaded image to a just-created owner row. Used by
// forms (QuoteForm, MemeForm) whose ImagePicker had no ownerId yet at pick
// time - see the module comment above - once the row has been saved and has
// an id. Not a react-query mutation because these call sites are one-shot
// saves, not components re-rendering off mutation state.
export function attachUploadedImage(imageId, ownerType, ownerId, role) {
  return fetchJson(endpoints.images.attach(imageId), {
    method: "POST",
    ...jsonBody({ owner_type: ownerType, owner_id: ownerId, role }),
  });
}

export default function ImagePicker({
  ownerType,
  ownerId,
  role = "cover",
  value,
  onChange,
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const upload = useUploadImage();
  const attach = useAttachImage();

  const busy = upload.isPending || attach.isPending;

  // Returns an attach-failure message, or null when attach was skipped
  // (no ownerId yet) or succeeded.
  async function tryAttach(imageId) {
    if (!ownerId) return null;
    try {
      await attach.mutateAsync({ imageId, ownerType, ownerId, role });
      return null;
    } catch (err) {
      return err.message || "Attaching the image failed.";
    }
  }

  async function handleFiles(fileList) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    try {
      const image = await upload.mutateAsync(file);
      const attachError = await tryAttach(image.system_id);
      onChange(image.storage_key, image.system_id);
      if (attachError) setError(attachError);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function chooseFromLibrary(image) {
    setLibraryOpen(false);
    setError(null);
    const attachError = await tryAttach(image.system_id);
    onChange(image.storage_key, image.system_id);
    if (attachError) setError(attachError);
  }

  return (
    <div className="space-y-2">
      {value && (
        <img
          src={getCoverUrl(value)}
          alt="Current image"
          className="max-h-40 rounded-lg border border-border"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border-strong bg-surface px-3 py-1.5 text-sm text-text hover:border-text">
          {busy ? "Working…" : "Upload"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label="Upload"
            className="hidden"
            disabled={busy}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>

        <Button
          type="button"
          kind="outline"
          size="sm"
          disabled={busy}
          onClick={() => setLibraryOpen(true)}
        >
          Choose from library
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {libraryOpen && (
        <LibraryModal
          onSelect={chooseFromLibrary}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  );
}

function LibraryModal({ onSelect, onClose }) {
  const { data, isLoading } = useImages({ limit: 60 });
  const images = data?.images ?? [];
  // stopPropagation-free backdrop dismiss, matching RemarkModal: only a press
  // that both starts and ends on the backdrop itself closes the modal.
  const pressedBackdrop = useRef(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="m-4 w-full max-w-3xl overflow-hidden border border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Choose from library
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="px-1.5 py-1 text-text-faint hover:text-text"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
          {!isLoading && images.length === 0 && (
            <p className="text-sm text-text-muted">The library is empty.</p>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {images.map((image) => (
              <button
                type="button"
                key={image.system_id}
                onClick={() => onSelect(image)}
                className="group relative aspect-square overflow-hidden rounded border border-border bg-surface-2 hover:border-brand"
              >
                {image.missing ? (
                  <span className="flex h-full items-center justify-center px-1 text-center text-[10px] text-text-faint">
                    not on this machine
                  </span>
                ) : (
                  <img
                    src={getCoverUrl(image.thumb_key || image.storage_key)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
