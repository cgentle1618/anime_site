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
  const key = Array.isArray(queryKey) ? queryKey : [queryKey];

  return useQuery({
    queryKey: params ? [...key, params] : key,
    queryFn: () => fetchJson(finalUrl),
    staleTime,
    enabled,
    ...queryOptions,
  });
}

