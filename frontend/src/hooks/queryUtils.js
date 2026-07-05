// Frontend: shared URL and fetch helpers for API requests.
export function buildUrl(url, params) {
  if (!params) return url;
  // Convert a plain object into a query string and skip empty values.
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

export async function fetchJson(url, options = {}) {
  // Always send cookies so authenticated API calls work in the browser.
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    // Prefer backend error messages when available, otherwise fall back to HTTP status text.
    const fallback = res.statusText || "Request failed";
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || data?.message || fallback);
  }
  return res.json();
}


