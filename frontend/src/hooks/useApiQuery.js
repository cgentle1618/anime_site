// Frontend: generic React Query wrapper for JSON API calls.
import { useQuery } from "@tanstack/react-query";
import { buildUrl, fetchJson } from "./queryUtils";

export function useApiQuery(queryKey, url, options = {}) {
  const {
    params,
    enabled = true,
    staleTime = 30_000,
    queryOptions = {},
  } = options;
  const finalUrl = buildUrl(url, params);
  // TanStack Query wants an array key so it can cache related requests correctly.
  const key = Array.isArray(queryKey) ? queryKey : [queryKey];

  return useQuery({
    // Include params in the cache key when present so different filters do not collide.
    queryKey: params ? [...key, params] : key,
    queryFn: () => fetchJson(finalUrl),
    staleTime,
    enabled,
    ...queryOptions,
  });
}


