// Frontend: the image library manager.
//
// The manager is unused-only for deletion by design: to remove an attached
// image you detach it first, then delete it once nothing uses it. The API
// still accepts DELETE ?force=true, but no control here offers it - removing
// an attached image is a decision made at the place that uses it, not a
// blanket "delete anyway" from this page.
import { useEffect, useState } from "react";

import { IMAGE_OWNER_TYPE_GROUPS } from "../../config/imageOwnerTypes";
import { getCoverUrl } from "../../lib/covers";
import {
  useDeleteImage,
  useDetachImage,
  useImages,
  useUploadImage,
} from "../../hooks/useImages";
import { Button, Chip } from "../../components/ui/primitives";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 250;

const FILTERS = [
  { key: "unused", label: "Unused" },
  { key: "missing", label: "Not on this machine" },
  { key: "duplicates", label: "Duplicates" },
];

function formatBytes(n) {
  if (!n) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageTile({ image, onDetach, onDelete, busy }) {
  const canDelete = image.attachments.length === 0;

  return (
    <div className="flex flex-col gap-2 border border-border bg-surface p-2">
      <div className="relative aspect-square overflow-hidden rounded border border-border bg-surface-2">
        {image.missing ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
            <span className="text-[10px] uppercase tracking-wide text-text-faint">
              Not on this machine
            </span>
          </div>
        ) : (
          <img
            src={getCoverUrl(image.thumb_key || image.storage_key)}
            alt={image.original_filename || ""}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="min-w-0 space-y-1 text-xs text-text-muted">
        <p className="truncate" title={image.original_filename || ""}>
          {image.original_filename || image.storage_key}
        </p>
        <p className="text-text-faint">
          {[formatBytes(image.byte_size), image.width && image.height ? `${image.width}×${image.height}` : null]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>

      {image.attachments.length === 0 ? (
        <Chip tone="muted">Unused</Chip>
      ) : (
        <ul className="space-y-1">
          {image.attachments.map((a) => (
            <li key={a.system_id} className="flex items-center justify-between gap-2">
              <Chip tone="ink" className="min-w-0 truncate">
                {a.owner_type} · {a.role}
              </Chip>
              <button
                type="button"
                onClick={() => onDetach(image, a)}
                disabled={busy}
                className="shrink-0 text-[10px] uppercase tracking-wide text-text-faint underline hover:text-text disabled:opacity-50"
              >
                Detach
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        kind="danger"
        size="sm"
        disabled={!canDelete || busy}
        title={canDelete ? undefined : "Detach every use before deleting."}
        onClick={() => onDelete(image)}
      >
        Delete
      </Button>
    </div>
  );
}

export default function Images() {
  const [filters, setFilters] = useState({
    unused: false,
    missing: false,
    duplicates: false,
  });
  const [ownerType, setOwnerType] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState(null);

  // Debounced the same way the rest of the app debounces typed search (see
  // useGlobalMediaSearch / CastEditor).
  useEffect(() => {
    const handle = setTimeout(() => setQ(qInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [qInput]);

  const query = useImages({
    ...filters,
    // `unused` wins over `owner_type` on the backend - the combination is
    // always empty - so skip sending it while Unused is active rather than
    // offering a filter combination that silently returns nothing.
    ownerType: filters.unused ? "" : ownerType,
    q,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const upload = useUploadImage();
  const detach = useDetachImage();
  const del = useDeleteImage();

  const images = query.data?.images ?? [];
  const total = query.data?.total ?? 0;
  const busy = upload.isPending || detach.isPending || del.isPending;

  function toggleFilter(key) {
    setPage(0);
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function uploadFiles(fileList) {
    setError(null);
    const files = Array.from(fileList || []);
    for (const file of files) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await upload.mutateAsync(file);
      } catch (err) {
        setError(err.message || "Upload failed.");
      }
    }
  }

  async function handleDetach(image, attachment) {
    setError(null);
    try {
      await detach.mutateAsync({
        imageId: image.system_id,
        attachmentId: attachment.system_id,
      });
    } catch (err) {
      setError(err.message || "Detach failed.");
    }
  }

  async function handleDelete(image) {
    setError(null);
    try {
      await del.mutateAsync({ imageId: image.system_id });
    } catch (err) {
      setError(err.message || "Delete failed.");
    }
  }

  const missingActive = filters.missing;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold">Image library</h1>
      <p className="mb-4 text-text-muted">
        Every image ever uploaded from this or another machine. Uploaded
        images are not covers and never travel through Backup or Pull, so a
        different machine will show them as not on this machine rather than
        broken — the bytes simply have not been copied over yet.
      </p>

      <div
        className="mb-4 flex flex-col items-center justify-center gap-2 border border-dashed border-border-strong bg-surface-2/40 p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          uploadFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-sm text-text-muted">
          Drag images here, or
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border-strong bg-surface px-3 py-1.5 text-sm text-text hover:border-text">
          {upload.isPending ? "Uploading…" : "Choose files"}
          <input
            type="file"
            accept="image/*"
            multiple
            aria-label="Upload"
            className="hidden"
            disabled={upload.isPending}
            onChange={(e) => uploadFiles(e.target.files)}
          />
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => toggleFilter(f.key)}
            aria-pressed={filters[f.key]}
          >
            <Chip tone={filters[f.key] ? "brand" : "ink"}>{f.label}</Chip>
          </button>
        ))}

        <select
          aria-label="Used on"
          value={ownerType}
          disabled={filters.unused}
          title={
            filters.unused
              ? "Clear Unused to filter by where an image is used."
              : undefined
          }
          onChange={(e) => {
            setPage(0);
            setOwnerType(e.target.value);
          }}
          className="rounded border border-border-strong bg-surface px-2 py-1.5 text-sm text-text disabled:opacity-50"
        >
          <option value="">Used on…</option>
          {IMAGE_OWNER_TYPE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <input
          type="search"
          value={qInput}
          onChange={(e) => {
            setPage(0);
            setQInput(e.target.value);
          }}
          placeholder="Search filename…"
          aria-label="Search filename"
          className="min-w-[10rem] flex-1 rounded border border-border-strong bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-faint"
        />
      </div>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {query.isLoading && <p className="text-text-muted">Loading…</p>}

      {!query.isLoading && images.length === 0 && (
        <p className="text-text-muted">
          {missingActive
            ? "Nothing here is missing — every uploaded image is on this machine."
            : "No images match these filters."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {images.map((image) => (
          <ImageTile
            key={image.system_id}
            image={image}
            onDetach={handleDetach}
            onDelete={handleDelete}
            busy={busy}
          />
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
          <Button
            kind="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span>
            {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}
          </span>
          <Button
            kind="outline"
            size="sm"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
