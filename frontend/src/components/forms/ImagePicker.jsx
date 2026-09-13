// Frontend: an inline "pick or upload an image" control.
//
// Upload and attach are two separate API calls (see app/routers/images.py) -
// an image can exist in the library with no owner, and this widget just makes
// both calls in sequence so the caller sees one action. Attach is best-effort:
// some owner types the surrounding form uses (a meme, for instance) are not
// yet attachable owners on the backend, and a brand-new quote/meme has no
// ownerId at all until it is first saved. Either way the upload still
// succeeds and the surrounding form persists the storage key itself on save,
// so a failed or skipped attach never loses the reference.
import { useRef, useState } from "react";

import { getCoverUrl } from "../../lib/covers";
import { useAttachImage, useImages, useUploadImage } from "../../hooks/useImages";
import { Button } from "../ui/primitives";

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

  async function tryAttach(imageId) {
    if (!ownerId) return;
    try {
      await attach.mutateAsync({ imageId, ownerType, ownerId, role });
    } catch {
      // Best-effort - see file header.
    }
  }

  async function handleFiles(fileList) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    try {
      const image = await upload.mutateAsync(file);
      await tryAttach(image.system_id);
      onChange(image.storage_key);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function chooseFromLibrary(image) {
    setLibraryOpen(false);
    setError(null);
    await tryAttach(image.system_id);
    onChange(image.storage_key);
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
                    src={getCoverUrl(image.storage_key)}
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
