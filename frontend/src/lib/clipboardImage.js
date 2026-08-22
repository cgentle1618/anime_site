// Copying a quote image to the OS clipboard.
//
// Quote images are served from our own origin (/static/quotes/...), so the
// fetch below needs no CORS rule. That changes if quote images ever move to
// the GCS bucket - a cross-origin fetch would then require one.

// Browsers only accept PNG on the clipboard, so anything else is re-encoded
// through a canvas first.
async function toPngBlob(blob) {
  if (blob.type === "image/png") return blob;

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error("Canvas encode failed"))),
      "image/png",
    );
  });
}

/**
 * Copies the image at `url` to the clipboard.
 * Returns { ok: true } or { ok: false, error } - never throws, so callers can
 * feed the result straight to a toast.
 */
export async function copyImageToClipboard(url) {
  if (!url) return { ok: false, error: "No image to copy." };

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    return { ok: false, error: "This browser cannot copy images." };
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Image not found (${res.status}).` };

    const png = await toPngBlob(await res.blob());
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return { ok: true };
  } catch (err) {
    // Most often: the document was not focused when write() ran.
    return { ok: false, error: err?.message || "Copy failed." };
  }
}

/** Copies plain text, for the quote line itself. */
export async function copyTextToClipboard(text) {
  if (!text) return { ok: false, error: "Nothing to copy." };
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "Copy failed." };
  }
}
