import { useQuery } from "@tanstack/react-query";
import { MEDIA_CONFIG } from "../utils/media";
import { buildUrl, fetchJson } from "./queryUtils";

/**
 * Standard options for fetching a full library list (up to 2000 items).
 * Import and spread into useMediaList calls: useMediaList("anime", LIST_OPTIONS)
 */
export const LIST_OPTIONS = { params: { limit: 2000 } };

export function mediaListQueryKey(type, params) {
  return params ? ["media-list", type, params] : ["media-list", type];
}

export function useMediaList(type, options = {}) {
  const {
    params,
    enabled = true,
    staleTime = 30_000,
    queryOptions = {},
  } = options;
  const endpoint = MEDIA_CONFIG[type]?.apiEndpoint;
  const url = endpoint ? buildUrl(`${endpoint}/`, params) : null;

  return useQuery({
    queryKey: mediaListQueryKey(type, params),
    queryFn: () => fetchJson(url),
    staleTime,
    enabled: enabled && !!url,
    ...queryOptions,
  });
}

