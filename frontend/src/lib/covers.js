// Cover image URL resolution and the no-image fallback.

const BUCKET_NAME = "cg1618-anime-covers";

const FALLBACK_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23E5E7EB%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2212%22 fill=%22%236B7280%22 font-weight=%22bold%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E`;

export { FALLBACK_SVG };

export function getCoverUrl(coverFile) {
  if (!coverFile || coverFile === "N/A") return FALLBACK_SVG;
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  return isLocal
    ? `/static/covers/${coverFile}`
    : `https://storage.googleapis.com/${BUCKET_NAME}/${coverFile}`;
}
