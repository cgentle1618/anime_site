export function buildUrl(url, params) {
  if (!params) return url;
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
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const fallback = res.statusText || "Request failed";
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || data?.message || fallback);
  }
  return res.json();
}

